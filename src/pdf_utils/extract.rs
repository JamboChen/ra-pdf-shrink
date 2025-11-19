use lopdf::{Document, Object};
use std::collections::HashMap;

pub type SlideRanges = HashMap<u32, (u32, u32)>;

pub fn extract_slide_ranges(doc: &Document) -> SlideRanges {
    let mut result = SlideRanges::new();

    let catalog_dict = match doc.catalog() {
        Ok(d) => d,
        Err(_) => return result,
    };

    let page_labels_obj = match catalog_dict.get(b"PageLabels") {
        Ok(obj) => obj,
        Err(_) => return result,
    };

    let page_labels_dict = if let Ok(id) = page_labels_obj.as_reference() {
        match doc.get_dictionary(id) {
            Ok(d) => d,
            Err(_) => return result,
        }
    } else if let Ok(d) = page_labels_obj.as_dict() {
        d
    } else {
        return result;
    };

    let nums = match page_labels_dict.get(b"Nums") {
        Ok(n) => n,
        Err(_) => return result,
    };

    let nums_array = match nums.as_array() {
        Ok(a) => a,
        Err(_) => return result,
    };

    let total_pages = doc.get_pages().len() as u32;
    let mut ranges = Vec::new();

    for chunk in nums_array.chunks(2) {
        if chunk.len() != 2 {
            continue;
        }

        let start_page = match chunk[0].as_i64() {
            Ok(p) => p as u32,
            Err(_) => continue,
        };

        let dict = match &chunk[1] {
            Object::Reference(id) => {
                if let Ok(d) = doc.get_dictionary(*id) {
                    d
                } else {
                    continue;
                }
            }
            Object::Dictionary(d) => d,
            _ => continue,
        };

        if let Some(frame) = parse_label_dict(dict) {
            ranges.push((start_page, frame));
        }
    }

    if ranges.is_empty() {
        return result;
    }

    ranges.sort_by_key(|r| r.0);

    for i in 0..ranges.len() {
        let (start_page, slide_num) = ranges[i];

        let end_page = if i + 1 < ranges.len() {
            ranges[i + 1].0 - 1
        } else {
            total_pages - 1
        };

        result.insert(slide_num, (start_page + 1, end_page + 1));
    }

    result
}

fn parse_label_dict(dict: &lopdf::Dictionary) -> Option<u32> {
    if let Ok(prefix_obj) = dict.get(b"P") {
        if let Ok(bytes) = prefix_obj.as_str() {
            if let Some(num) = decode_utf16_bytes(bytes) {
                return Some(num);
            }
        }
    }

    if let Ok(start_obj) = dict.get(b"St") {
        if let Ok(start_num) = start_obj.as_i64() {
            return Some(start_num as u32);
        }
    }

    None
}

fn decode_utf16_bytes(bytes: &[u8]) -> Option<u32> {
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let chars: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        if let Ok(decoded) = String::from_utf16(&chars) {
            return decoded.trim().parse().ok();
        }
    } else {
        let text: String = bytes.iter().map(|&b| b as char).collect();
        return text.trim().parse().ok();
    }

    None
}

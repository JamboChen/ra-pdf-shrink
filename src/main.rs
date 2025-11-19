use lopdf::Document;
use pdf_extract::extract_text;
use regex::Regex;
use std::collections::HashMap;
use std::env;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    //------------------------------------
    // CLI
    //------------------------------------
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: shrink input.pdf output.pdf");
        std::process::exit(1);
    }

    let input_pdf = &args[1];
    let output_pdf = &args[2];

    //------------------------------------
    // Step 1 文字抽取（只為找到哪些頁是同一 PPT）
    //------------------------------------
    let full_text = extract_text(input_pdf)?;

    // 匹配：
    // (頁面內容)(12/44)(換行)
    let re_page = Regex::new(r"(?s)(.*?)(\d+\s*/\s*\d+)(?:\s*\n+|$)").unwrap();

    let mut text_pages = Vec::<(String, String)>::new();
    for cap in re_page.captures_iter(&full_text) {
        text_pages.push((
            cap.get(1).unwrap().as_str().to_string(),
            cap.get(2).unwrap().as_str().to_string(),
        ));
    }

    println!("Extracted {} text pages", text_pages.len());

    // 從頁碼 x/y 拿 x
    let re_extract_x = Regex::new(r"(\d+)\s*/\s*\d+").unwrap();

    let mut groups = HashMap::<u32, Vec<usize>>::new();

    for (idx, (_, page_no)) in text_pages.iter().enumerate() {
        if let Some(caps) = re_extract_x.captures(page_no) {
            let slide_num: u32 = caps[1].parse().unwrap();
            groups.entry(slide_num).or_default().push(idx);
        }
    }

    // 每組取最後一頁 text index
    let mut keep_text_indexes = Vec::new();
    for (_s, idxs) in groups {
        keep_text_indexes.push(*idxs.last().unwrap());
    }

    keep_text_indexes.sort();

    println!("Will keep {} text pages", keep_text_indexes.len());

    //------------------------------------
    // Step 2 使用 lopdf 操作 PDF
    //      這裡不使用 text index 當 PDF index！
    //------------------------------------
    let mut doc = Document::load(input_pdf)?;
    let pages_tree = doc.get_pages(); // BTreeMap<u32, ObjectId>
    let pdf_page_count = pages_tree.len() as u32;

    println!("PDF has {} pages", pdf_page_count);

    //------------------------------------
    // 文字頁數 ≠ PDF 頁數！
    // 所以要對照 PPT 頁碼順序來取 PDF 頁
    //------------------------------------

    // 把 text-index 映射回 "它應該是第幾個 PDF 頁"
    // 假設文字抽出順序與 PDF 頁順序一致（通常成立）
    let mut keep_pdf_pages = Vec::<u32>::new();
    for idx in keep_text_indexes {
        let pdf_page = (idx + 1) as u32;
        if pdf_page <= pdf_page_count {
            keep_pdf_pages.push(pdf_page);
        }
    }
    println!("Mapped to PDF pages: {:?}", keep_pdf_pages);

    //------------------------------------
    // Step 3 刪除不要的頁（在原 PDF 上操作）
    //------------------------------------
    let delete_pages = (1..=pdf_page_count)
        .filter(|p| !keep_pdf_pages.contains(p))
        .map(|f| f as u32)
        .collect::<Vec<u32>>();
    doc.delete_pages(&delete_pages);

    //------------------------------------
    // Step 4 儲存
    //------------------------------------
    doc.prune_objects();
    doc.save(output_pdf)?;

    println!("Done!");
    Ok(())
}

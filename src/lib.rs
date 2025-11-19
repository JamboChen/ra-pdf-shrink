mod pdf_utils;
use lopdf::Document;
use pdf_utils::extract_slide_ranges;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[macro_export]
macro_rules! log {
    ($($t:tt)*) => {
        web_sys::console::log_1(&format!($($t)*).into());
    }
}

#[wasm_bindgen]
pub fn shrink_pdf(input_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut doc = Document::load_mem(input_bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let slide_ranges = extract_slide_ranges(&doc);

    if slide_ranges.is_empty() {
        return Err(JsValue::from_str("Can not shrink"));
    }

    let mut keep_pages: Vec<u32> = slide_ranges.values().map(|(_start, end)| *end).collect();

    keep_pages.sort_unstable();

    let all_pages: Vec<u32> = doc.get_pages().keys().copied().collect();
    let delete_pages: Vec<u32> = all_pages
        .into_iter()
        .filter(|p| !keep_pages.contains(p))
        .collect();

    doc.delete_pages(&delete_pages);
    doc.prune_objects();

    let mut buffer = Vec::new();
    doc.save_to(&mut Cursor::new(&mut buffer))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(buffer)
}

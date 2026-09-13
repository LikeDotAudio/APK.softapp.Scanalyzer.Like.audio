// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// The micro-API the Web_Front talks to, and the static host for the bundle.
//
// Owns: /api/* dispatch and the static fallback. Every analysis route is a POST
// whose body IS the file -- nothing here reads a path the client sent, so the
// browser cannot ask this server to open an arbitrary file on the host.
//
// The two GET routes are the exception and they are why this function takes
// arguments rather than constants. /api/catalog walks `scan_root` and
// /api/inventory reads `inventory`; both were `Path::new("../WBSps.ca")` and
// `Path::new("manual_inventory.json")` -- relative to the working directory, so
// the binary answered correctly from exactly one folder on one machine and
// silently 404'd or indexed the wrong tree everywhere else. They are now passed
// in from the CLI, and an absent inventory is 404 rather than a fallback guess.
//
// Must not: serve outside `static_directory`. The static branch rejects any request
// path containing "..", so a traversal cannot climb out of the bundle.

use tiny_http::{Header, Method, Response, Server};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use crate::file_sorter::FileSorter;
use crate::image_analyzer::ImageAnalyzer;
use crate::ocr::OcrEngine;
use crate::photo_id::PhotoIdentifier;
use crate::sorting::benchmark::BenchmarkSuite;
use crate::vectorizer::VectorizerEngine;
use crate::word_analyzer::WordAnalyzer;

pub fn start_server(
    host: &str,
    port: u16,
    static_directory: PathBuf,
    scan_root: PathBuf,
    inventory: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let address = format!("{}:{}", host, port);
    let server = Server::http(&address).map_err(|e| format!("Could not bind to {}: {}", address, e))?;
    let static_directory = Arc::new(static_directory);
    let scan_root = Arc::new(scan_root);
    let inventory = Arc::new(inventory);

    println!("=======================================================");
    println!("  🦀 RUST MICRO-API SERVER LISTENING ON http://{}", address);
    println!("  📁 Serving web dashboard from: {}", static_directory.display());
    println!("  🗂️  /api/catalog indexes: {}", scan_root.display());
    match inventory.as_ref() {
        Some(path) => println!("  📇 /api/inventory serves: {}", path.display()),
        None => println!("  📇 /api/inventory: no inventory given — this route answers 404"),
    }
    println!("=======================================================");

    for mut request in server.incoming_requests() {
        let url = request.url().to_string();
        let method = request.method().clone();
        let static_directory = Arc::clone(&static_directory);
        let scan_root = Arc::clone(&scan_root);
        let inventory = Arc::clone(&inventory);

        // CORS Headers
        let cors_headers = vec![
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap(),
        ];

        if method == Method::Options {
            let mut response = Response::from_string("").with_status_code(200);
            for h in cors_headers {
                response.add_header(h);
            }
            let _ = request.respond(response);
            continue;
        }

        if url.starts_with("/api/") {
            let mut body = Vec::new();
            let _ = request.as_reader().read_to_end(&mut body);

            let (status_code, response_json) = match (method.clone(), url.as_str()) {
                (Method::Get, url_str) if url_str.starts_with("/api/inventory") => {
                    match inventory.as_ref() {
                        Some(path) => match fs::read_to_string(path) {
                            Ok(content) => (200, content),
                            Err(error) => (
                                404,
                                format!(
                                    r#"{{"error": "inventory {} could not be read: {}"}}"#,
                                    path.display(),
                                    error
                                ),
                            ),
                        },
                        None => (
                            404,
                            r#"{"error": "no inventory configured; pass --inventory to serve one"}"#
                                .to_string(),
                        ),
                    }
                }
                (Method::Get, url_str) if url_str.starts_with("/api/catalog") || url_str.starts_with("/api/catalog?") => {
                    let target = scan_root.as_path();
                    let sort_key = if url_str.contains("sort=name") {
                        "name"
                    } else if url_str.contains("sort=date") {
                        "date"
                    } else if url_str.contains("sort=extension") {
                        "extension"
                    } else {
                        "size"
                    };

                    if let Ok(report) = FileSorter::index_and_sort(target, sort_key) {
                        (200, serde_json::to_string(&report).unwrap_or_default())
                    } else {
                        (500, r#"{"error": "Failed to index directory"}"#.to_string())
                    }
                }
                (Method::Post, "/api/ocr") => {
                    if let Ok(img) = image::load_from_memory(&body) {
                        let result = OcrEngine::process_image(&img);
                        (200, serde_json::to_string(&result).unwrap_or_default())
                    } else {
                        (400, r#"{"error": "Invalid image payload"}"#.to_string())
                    }
                }
                (Method::Post, "/api/analyze-image") => {
                    if let Ok(img) = image::load_from_memory(&body) {
                        let result = ImageAnalyzer::analyze(&img);
                        (200, serde_json::to_string(&result).unwrap_or_default())
                    } else {
                        (400, r#"{"error": "Invalid image payload"}"#.to_string())
                    }
                }
                (Method::Post, "/api/to-svg") => {
                    if let Ok(img) = image::load_from_memory(&body) {
                        let result = VectorizerEngine::convert_to_svg(&img, 128);
                        (200, serde_json::to_string(&result).unwrap_or_default())
                    } else {
                        (400, r#"{"error": "Invalid image payload"}"#.to_string())
                    }
                }
                (Method::Post, "/api/photo-id") => {
                    if let Ok(img) = image::load_from_memory(&body) {
                        let result = PhotoIdentifier::identify(&img);
                        (200, serde_json::to_string(&result).unwrap_or_default())
                    } else {
                        (400, r#"{"error": "Invalid image payload"}"#.to_string())
                    }
                }
                (Method::Post, "/api/word-analyze") => {
                    let text = String::from_utf8_lossy(&body).to_string();
                    let result = WordAnalyzer::analyze_text(&text);
                    (200, serde_json::to_string(&result).unwrap_or_default())
                }
                (Method::Post, "/api/benchmark-sorts") => {
                    let data: Vec<String> = if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&body) {
                        if let Some(arr) = json_val.get("tokens").and_then(|v| v.as_array()) {
                            arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
                        } else {
                            (0..500).map(|i| format!("word_{:04}", (i * 37) % 500)).collect()
                        }
                    } else {
                        (0..500).map(|i| format!("word_{:04}", (i * 37) % 500)).collect()
                    };

                    let result = BenchmarkSuite::benchmark_strings("API_Request", &data);
                    (200, serde_json::to_string(&result).unwrap_or_default())
                }
                (Method::Post, "/api/docx-parse") => {
                    let extension = "docx";
                    let result = crate::plugins::docx_plugin::DocxPlugin::parse_bytes(&body, extension);
                    (200, serde_json::to_string(&result).unwrap_or_default())
                }
                (Method::Post, "/api/dxf-parse") => {
                    let result = crate::plugins::dxf_plugin::DxfPlugin::parse_bytes(&body);
                    (200, serde_json::to_string(&result).unwrap_or_default())
                }
                (Method::Post, "/api/dxf-render") => {
                    // Render DXF bytes to PNG using Python ezdxf
                    let temporary_input = format!("/tmp/dxf_{}.dxf", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
                    let temporary_output = format!("{}.png", temporary_input);
                    
                    if std::fs::write(&temporary_input, &body).is_ok() {
                        let py_script = format!(r#"
import ezdxf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

try:
    doc = ezdxf.readfile('{}')
    fig = plt.figure(figsize=(10, 8), facecolor='#020617')
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor('#020617')
    ctx = RenderContext(doc)
    out = MatplotlibBackend(ax)
    Frontend(ctx, out).draw_layout(doc.modelspace(), finalize=True)
    fig.savefig('{}', dpi=150, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close(fig)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {{e}}")
"#, temporary_input, temporary_output);

                        // This is the one route that shells out. ezdxf and
                        // matplotlib are optional and frequently absent, so the
                        // interpreter's own words are kept and returned: a bare
                        // "Failed to render" told the operator nothing, and the
                        // real answer is almost always one missing import.
                        let output = std::process::Command::new("python3")
                            .arg("-c")
                            .arg(py_script)
                            .output();

                        if let Ok(png_bytes) = std::fs::read(&temporary_output) {
                            let _ = std::fs::remove_file(&temporary_input);
                            let _ = std::fs::remove_file(&temporary_output);
                            let b64 = format!("data:image/png;base64,{}", rust_base64_encode(&png_bytes));
                            (200, serde_json::json!({ "status": "ok", "png_base64": b64 }).to_string())
                        } else {
                            let _ = std::fs::remove_file(&temporary_input);
                            let detail = match &output {
                                Ok(done) => {
                                    let error = String::from_utf8_lossy(&done.stderr);
                                    let out = String::from_utf8_lossy(&done.stdout);
                                    let said = if error.trim().is_empty() { out } else { error };
                                    said.lines().last().unwrap_or("no output").to_string()
                                }
                                Err(error) => format!("python3 could not be run: {}", error),
                            };
                            (
                                500,
                                serde_json::json!({
                                    "error": "Failed to render DXF image",
                                    "detail": detail,
                                    "needs": "python3 with ezdxf and matplotlib",
                                })
                                .to_string(),
                            )
                        }
                    } else {
                        (500, r#"{"error": "Failed to write temp DXF"}"#.to_string())
                    }
                }
                (Method::Post, "/api/face-match") => {
                    if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&body) {
                        let h1 = json_val.get("hash1").and_then(|v| v.as_u64()).unwrap_or(0);
                        let h2 = json_val.get("hash2").and_then(|v| v.as_u64()).unwrap_or(0);
                        let match_score = crate::face_detector::FaceDetector::match_faces(h1, h2);
                        let result = serde_json::json!({
                            "hash1": format!("0x{:016x}", h1),
                            "hash2": format!("0x{:016x}", h2),
                            "match_score": match_score,
                            "match_percentage": format!("{:.1}%", match_score * 100.0),
                            "is_same_person": match_score >= 0.75
                        });
                        (200, result.to_string())
                    } else {
                        (400, r#"{"error": "Invalid JSON payload"}"#.to_string())
                    }
                }
                _ => (404, r#"{"error": "Endpoint not found"}"#.to_string()),
            };

            let response = Response::from_string(response_json)
                .with_status_code(status_code);
            let mut response = response;
            response.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
            for h in cors_headers {
                response.add_header(h);
            }
            let _ = request.respond(response);
        } else {
            // Serve static files
            // The query and fragment are the page's own address for one of its
            // screens, not part of any filename -- cut them before this becomes
            // a path, or every deep link 404s on a file called "index.html?tab=3".
            let cut = url.find(['?', '#']).unwrap_or(url.len());
            let rel_path = if &url[..cut] == "/" { "/index.html" } else { &url[..cut] };
            let clean_path = rel_path.trim_start_matches('/');

            // NO CLIMBING OUT OF THE BUNDLE. `static_directory.join("../../etc/passwd")`
            // resolves happily, so a component-wise refusal is the guard; a string
            // search for ".." is not, because a percent-encoded or nested form
            // reaches Path::join as a ParentDir component all the same.
            let escapes = Path::new(clean_path)
                .components()
                .any(|c| !matches!(c, Component::Normal(_)));
            if escapes {
                let response = Response::from_string("403 Forbidden").with_status_code(403);
                let _ = request.respond(response);
                continue;
            }

            let file_path = static_directory.join(clean_path);

            if file_path.exists() && file_path.is_file() {
                if let Ok(content) = fs::read(&file_path) {
                    let mime = match file_path.extension().and_then(|e| e.to_str()) {
                        Some("html") => "text/html",
                        Some("css") => "text/css",
                        Some("js") => "application/javascript",
                        Some("json") => "application/json",
                        Some("svg") => "image/svg+xml",
                        Some("png") => "image/png",
                        _ => "application/octet-stream",
                    };

                    let mut response = Response::from_data(content);
                    response.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
                    for h in cors_headers {
                        response.add_header(h);
                    }
                    let _ = request.respond(response);
                    continue;
                }
            }

            let response = Response::from_string("404 Not Found").with_status_code(404);
            let _ = request.respond(response);
        }
    }

    Ok(())
}

fn rust_base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(CHARS[((triple >> 18) & 63) as usize] as char);
        out.push(CHARS[((triple >> 12) & 63) as usize] as char);
        if i + 1 < data.len() {
            out.push(CHARS[((triple >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < data.len() {
            out.push(CHARS[(triple & 63) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

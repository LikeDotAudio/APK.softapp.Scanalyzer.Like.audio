// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// STAGE 3 OF Folder-ScanAnalyzer: the per-file GRAPHICS analysis, and the
// micro-API that serves it to the Web_Front.
//
// Owns: everything that reads one file's PIXELS or one file's format header --
// OCR, image metrics and perceptual dHash, raster->SVG vectorization, photo
// identification, face detection, word/frequency analysis, the sorting
// benchmarks the Sorted View draws, and the six format plugins (psd, cad, dxf,
// docx, cdr, wordpress) that read a header without decoding a whole document.
//
// Must not: assume a corpus. `serve` takes the folder it indexes as --scan-root
// and the inventory it serves as --inventory; both were hardcoded to one
// client's tree before this was ported in, which is what made the binary
// unusable anywhere else. There is no default for either -- an absent
// --inventory serves 404 rather than a guess, and that is the honest answer.
//
// Talks to nothing on the bus. It is an HTTP server and a CLI, and every
// analysis is a pure function of the bytes handed to it.

mod face_detector;
mod file_sorter;
mod image_analyzer;
mod ocr;
mod photo_id;
mod plugins;
mod server;
mod sorting;
mod vectorizer;
mod word_analyzer;

use clap::{Parser, Subcommand};
use file_sorter::FileSorter;
use image_analyzer::ImageAnalyzer;
use ocr::OcrEngine;
use photo_id::PhotoIdentifier;
use server::start_server;
use sorting::benchmark::BenchmarkSuite;
use vectorizer::VectorizerEngine;
use word_analyzer::WordAnalyzer;

use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "rust_image_data_suite")]
#[command(about = "Rust Image Processing, OCR, Vectorization, Word Analysis & Micro-API Server", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the Rust Micro-API HTTP Server & Dashboard host
    Serve {
        #[arg(short, long, default_value = "127.0.0.1")]
        host: String,
        #[arg(short, long, default_value_t = 26303)]
        port: u16,
        /// The built Web_Front bundle this server hands out.
        #[arg(short, long)]
        static_dir: PathBuf,
        /// The folder /api/catalog walks. No default: see the header contract.
        #[arg(long)]
        scan_root: PathBuf,
        /// JSON inventory /api/inventory serves. Absent means that route 404s.
        #[arg(long)]
        inventory: Option<PathBuf>,
    },
    /// Index and sort 1:1 files in a target directory
    IndexSort {
        /// The folder to index. No default: see the header contract.
        #[arg(short, long)]
        dir: PathBuf,
        #[arg(short, long, default_value = "size")]
        sort_by: String,
    },
    /// Perform OCR on an image file
    Ocr {
        #[arg(short, long)]
        image: PathBuf,
    },
    /// Perform Image Analysis (dimensions, color metrics, contrast, dHash)
    AnalyzeImage {
        #[arg(short, long)]
        image: PathBuf,
    },
    /// Convert raster image to SVG vector graphics
    ToSvg {
        #[arg(short, long)]
        image: PathBuf,
        #[arg(short, long, default_value_t = 128)]
        threshold: u8,
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Identify photo type and extracted visual traits
    PhotoId {
        #[arg(short, long)]
        image: PathBuf,
    },
    /// Analyze text/word data file, frequency distribution, and name generation
    WordAnalyze {
        #[arg(short, long)]
        file: PathBuf,
    },
    /// Run Rust Sorting Algorithm Benchmarks on dataset
    BenchmarkSorts {
        #[arg(short, long)]
        file: Option<PathBuf>,
        #[arg(short, long, default_value_t = 1000)]
        size: usize,
    },
    /// Execute complete pipeline across sample image & dataset
    RunAll {
        #[arg(short, long)]
        image: PathBuf,
        #[arg(short, long)]
        text_file: PathBuf,
        #[arg(short, long, default_value = "report_output.json")]
        output_json: PathBuf,
    },
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Serve {
            host,
            port,
            static_dir,
            scan_root,
            inventory,
        } => {
            start_server(&host, port, static_dir, scan_root, inventory)?;
        }
        Commands::IndexSort { dir, sort_by } => {
            let report = FileSorter::index_and_sort(&dir, &sort_by)?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        Commands::Ocr { image } => {
            let decoded = image::open(&image)?;
            let result = OcrEngine::process_image(&decoded);
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        Commands::AnalyzeImage { image } => {
            let decoded = image::open(&image)?;
            let report = ImageAnalyzer::analyze(&decoded);
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        Commands::ToSvg {
            image,
            threshold,
            output,
        } => {
            let decoded = image::open(&image)?;
            let svg_result = VectorizerEngine::convert_to_svg(&decoded, threshold);
            if let Some(out_path) = output {
                fs::write(&out_path, &svg_result.svg_xml)?;
                println!("Saved SVG vector image to: {}", out_path.display());
            } else {
                println!("{}", serde_json::to_string_pretty(&svg_result)?);
            }
        }
        Commands::PhotoId { image } => {
            let decoded = image::open(&image)?;
            let identification = PhotoIdentifier::identify(&decoded);
            println!("{}", serde_json::to_string_pretty(&identification)?);
        }
        Commands::WordAnalyze { file } => {
            let content = fs::read_to_string(&file)?;
            let report = WordAnalyzer::analyze_text(&content);
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        Commands::BenchmarkSorts { file, size } => {
            let data: Vec<String> = if let Some(f_path) = file {
                let content = fs::read_to_string(f_path)?;
                content
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                (0..size)
                    .map(|i| format!("token_{:06}", (i * 37) % size))
                    .collect()
            };

            let benchmarks = BenchmarkSuite::benchmark_strings("Dataset", &data);
            println!("{}", serde_json::to_string_pretty(&benchmarks)?);
        }
        Commands::RunAll {
            image,
            text_file,
            output_json,
        } => {
            println!("--- RUNNING RUST IMAGE & DATA ANALYSIS SUITE ---");
            let decoded = image::open(&image)?;
            let text_content = fs::read_to_string(&text_file)?;

            println!("[1/6] Running OCR Engine...");
            let ocr_result = OcrEngine::process_image(&decoded);

            println!("[2/6] Analyzing Image Metrics...");
            let image_result = ImageAnalyzer::analyze(&decoded);

            println!("[3/6] Converting Image to SVG Vector...");
            let svg_result = VectorizerEngine::convert_to_svg(&decoded, 128);

            println!("[4/6] Identifying Photo Features...");
            let photo_result = PhotoIdentifier::identify(&decoded);

            println!("[5/6] Analyzing Words & Generating Names...");
            let combined_text = format!("{}\n{}", text_content, ocr_result.extracted_text);
            let word_result = WordAnalyzer::analyze_text(&combined_text);

            println!("[6/6] Benchmarking Rust Sorting Algorithms on extracted dataset...");
            let word_tokens: Vec<String> = word_result
                .top_frequencies
                .iter()
                .map(|wf| wf.word.clone())
                .collect();
            let sort_benchmarks = BenchmarkSuite::benchmark_strings("OCR_Word_Dataset", &word_tokens);

            let combined_report = serde_json::json!({
                "ocr_result": ocr_result,
                "image_analysis": image_result,
                "svg_vectorization": {
                    "width": svg_result.width,
                    "height": svg_result.height,
                    "path_count": svg_result.path_count,
                    "preview": &svg_result.svg_xml[..svg_result.svg_xml.len().min(300)]
                },
                "photo_identification": photo_result,
                "word_analysis": word_result,
                "sorting_benchmarks": sort_benchmarks,
            });

            fs::write(&output_json, serde_json::to_string_pretty(&combined_report)?)?;
            println!("Successfully generated full suite report: {}", output_json.display());
        }
    }

    Ok(())
}

use super::algorithms::*;
use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BenchmarkResult {
    pub algorithm: String,
    pub dataset_name: String,
    pub dataset_size: usize,
    pub elapsed_nanos: u128,
    pub comparisons: u64,
    pub swaps: u64,
    pub sorted_correctly: bool,
}

pub struct BenchmarkSuite;

impl BenchmarkSuite {
    pub fn benchmark_strings(dataset_name: &str, data: &[String]) -> Vec<BenchmarkResult> {
        let mut results = Vec::new();

        // QuickSort (Lomuto)
        let mut d1 = data.to_vec();
        let mut m1 = SortMetrics::default();
        let start = Instant::now();
        quick_sort_lomuto(&mut d1, &mut m1);
        let elapsed = start.elapsed().as_nanos();
        let is_sorted = d1.windows(2).all(|w| w[0] <= w[1]);
        results.push(BenchmarkResult {
            algorithm: "QuickSort (Lomuto)".to_string(),
            dataset_name: dataset_name.to_string(),
            dataset_size: data.len(),
            elapsed_nanos: elapsed,
            comparisons: m1.comparisons,
            swaps: m1.swaps,
            sorted_correctly: is_sorted,
        });

        // QuickSort (Hoare)
        let mut d2 = data.to_vec();
        let mut m2 = SortMetrics::default();
        let start = Instant::now();
        quick_sort_hoare(&mut d2, &mut m2);
        let elapsed = start.elapsed().as_nanos();
        let is_sorted = d2.windows(2).all(|w| w[0] <= w[1]);
        results.push(BenchmarkResult {
            algorithm: "QuickSort (Hoare)".to_string(),
            dataset_name: dataset_name.to_string(),
            dataset_size: data.len(),
            elapsed_nanos: elapsed,
            comparisons: m2.comparisons,
            swaps: m2.swaps,
            sorted_correctly: is_sorted,
        });

        // MergeSort
        let mut d3 = data.to_vec();
        let mut m3 = SortMetrics::default();
        let start = Instant::now();
        merge_sort(&mut d3, &mut m3);
        let elapsed = start.elapsed().as_nanos();
        let is_sorted = d3.windows(2).all(|w| w[0] <= w[1]);
        results.push(BenchmarkResult {
            algorithm: "MergeSort".to_string(),
            dataset_name: dataset_name.to_string(),
            dataset_size: data.len(),
            elapsed_nanos: elapsed,
            comparisons: m3.comparisons,
            swaps: m3.swaps,
            sorted_correctly: is_sorted,
        });

        // HeapSort
        let mut d4 = data.to_vec();
        let mut m4 = SortMetrics::default();
        let start = Instant::now();
        heap_sort(&mut d4, &mut m4);
        let elapsed = start.elapsed().as_nanos();
        let is_sorted = d4.windows(2).all(|w| w[0] <= w[1]);
        results.push(BenchmarkResult {
            algorithm: "HeapSort".to_string(),
            dataset_name: dataset_name.to_string(),
            dataset_size: data.len(),
            elapsed_nanos: elapsed,
            comparisons: m4.comparisons,
            swaps: m4.swaps,
            sorted_correctly: is_sorted,
        });

        // RadixSort (LSD String)
        let mut d5 = data.to_vec();
        let mut m5 = SortMetrics::default();
        let start = Instant::now();
        radix_sort_strings(&mut d5, &mut m5);
        let elapsed = start.elapsed().as_nanos();
        let is_sorted = d5.windows(2).all(|w| w[0] <= w[1]);
        results.push(BenchmarkResult {
            algorithm: "RadixSort (LSD String)".to_string(),
            dataset_name: dataset_name.to_string(),
            dataset_size: data.len(),
            elapsed_nanos: elapsed,
            comparisons: m5.comparisons,
            swaps: m5.swaps,
            sorted_correctly: is_sorted,
        });

        // InsertionSort (only if small enough to avoid slowdown)
        if data.len() <= 2000 {
            let mut d6 = data.to_vec();
            let mut m6 = SortMetrics::default();
            let start = Instant::now();
            insertion_sort(&mut d6, &mut m6);
            let elapsed = start.elapsed().as_nanos();
            let is_sorted = d6.windows(2).all(|w| w[0] <= w[1]);
            results.push(BenchmarkResult {
                algorithm: "InsertionSort".to_string(),
                dataset_name: dataset_name.to_string(),
                dataset_size: data.len(),
                elapsed_nanos: elapsed,
                comparisons: m6.comparisons,
                swaps: m6.swaps,
                sorted_correctly: is_sorted,
            });
        }

        results
    }
}

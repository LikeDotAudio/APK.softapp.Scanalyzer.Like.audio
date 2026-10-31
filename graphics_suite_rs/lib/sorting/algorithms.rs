#[derive(Debug, Clone, Default)]
pub struct SortMetrics {
    pub comparisons: u64,
    pub swaps: u64,
}

// --- QuickSort (Lomuto Partition) ---
pub fn quick_sort_lomuto<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) {
    if arr.len() <= 1 {
        return;
    }
    let p = partition_lomuto(arr, metrics);
    if p > 0 {
        quick_sort_lomuto(&mut arr[0..p], metrics);
    }
    if p + 1 < arr.len() {
        quick_sort_lomuto(&mut arr[p + 1..], metrics);
    }
}

fn partition_lomuto<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) -> usize {
    let len = arr.len();
    let pivot_index = len / 2;
    arr.swap(pivot_index, len - 1);
    metrics.swaps += 1;

    let mut i = 0;
    for j in 0..len - 1 {
        metrics.comparisons += 1;
        if arr[j] <= arr[len - 1] {
            if i != j {
                arr.swap(i, j);
                metrics.swaps += 1;
            }
            i += 1;
        }
    }
    if i != len - 1 {
        arr.swap(i, len - 1);
        metrics.swaps += 1;
    }
    i
}

// --- QuickSort (Hoare Partition) ---
pub fn quick_sort_hoare<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) {
    if arr.len() <= 1 {
        return;
    }
    let p = partition_hoare(arr, metrics);
    if p + 1 < arr.len() {
        quick_sort_hoare(&mut arr[0..=p], metrics);
        quick_sort_hoare(&mut arr[p + 1..], metrics);
    } else {
        // Fallback for edge cases with duplicated elements to prevent recursion infinite loop
        quick_sort_hoare(&mut arr[0..p], metrics);
    }
}

fn partition_hoare<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) -> usize {
    let pivot = arr[arr.len() / 2].clone();
    let mut i = 0;
    let mut j = arr.len() - 1;

    loop {
        while i < arr.len() && {
            metrics.comparisons += 1;
            arr[i] < pivot
        } {
            i += 1;
        }

        while j > 0 && {
            metrics.comparisons += 1;
            arr[j] > pivot
        } {
            j -= 1;
        }

        if i >= j {
            return if j == arr.len() - 1 && j > 0 { j - 1 } else { j };
        }

        arr.swap(i, j);
        metrics.swaps += 1;
        i += 1;
        if j > 0 {
            j -= 1;
        }
    }
}

// --- MergeSort (Recursive) ---
pub fn merge_sort<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) {
    let len = arr.len();
    if len <= 1 {
        return;
    }
    let mid = len / 2;
    let mut left = arr[..mid].to_vec();
    let mut right = arr[mid..].to_vec();

    merge_sort(&mut left, metrics);
    merge_sort(&mut right, metrics);

    let mut i = 0;
    let mut j = 0;
    let mut k = 0;

    while i < left.len() && j < right.len() {
        metrics.comparisons += 1;
        if left[i] <= right[j] {
            arr[k] = left[i].clone();
            metrics.swaps += 1;
            i += 1;
        } else {
            arr[k] = right[j].clone();
            metrics.swaps += 1;
            j += 1;
        }
        k += 1;
    }

    while i < left.len() {
        arr[k] = left[i].clone();
        metrics.swaps += 1;
        i += 1;
        k += 1;
    }

    while j < right.len() {
        arr[k] = right[j].clone();
        metrics.swaps += 1;
        j += 1;
        k += 1;
    }
}

// --- HeapSort ---
pub fn heap_sort<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) {
    let n = arr.len();
    if n <= 1 {
        return;
    }

    for i in (0..n / 2).rev() {
        heapify(arr, n, i, metrics);
    }

    for i in (1..n).rev() {
        arr.swap(0, i);
        metrics.swaps += 1;
        heapify(arr, i, 0, metrics);
    }
}

fn heapify<T: Ord + Clone>(arr: &mut [T], n: usize, i: usize, metrics: &mut SortMetrics) {
    let mut largest = i;
    let left = 2 * i + 1;
    let right = 2 * i + 2;

    if left < n {
        metrics.comparisons += 1;
        if arr[left] > arr[largest] {
            largest = left;
        }
    }

    if right < n {
        metrics.comparisons += 1;
        if arr[right] > arr[largest] {
            largest = right;
        }
    }

    if largest != i {
        arr.swap(i, largest);
        metrics.swaps += 1;
        heapify(arr, n, largest, metrics);
    }
}

// --- InsertionSort ---
pub fn insertion_sort<T: Ord + Clone>(arr: &mut [T], metrics: &mut SortMetrics) {
    for i in 1..arr.len() {
        let mut j = i;
        while j > 0 {
            metrics.comparisons += 1;
            if arr[j - 1] > arr[j] {
                arr.swap(j - 1, j);
                metrics.swaps += 1;
                j -= 1;
            } else {
                break;
            }
        }
    }
}

// --- RadixSort (for strings / word sorting) ---
pub fn radix_sort_strings(arr: &mut [String], metrics: &mut SortMetrics) {
    if arr.is_empty() {
        return;
    }
    let max_len = arr.iter().map(|s| s.len()).max().unwrap_or(0);

    for pos in (0..max_len).rev() {
        let mut buckets: Vec<Vec<String>> = vec![Vec::new(); 257]; // 256 byte values + 1 for shorter string padding

        for s in arr.iter() {
            let byte_value = if pos < s.len() {
                s.as_bytes()[pos] as usize + 1
            } else {
                0
            };
            buckets[byte_value].push(s.clone());
            metrics.swaps += 1;
        }

        let mut index = 0;
        for bucket in buckets {
            for item in bucket {
                arr[index] = item;
                index += 1;
            }
        }
    }
}

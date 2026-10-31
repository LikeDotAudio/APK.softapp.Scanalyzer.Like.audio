-- APK.audio — Scanalyzer sample corpus — MariaDB schema.
--
-- Apply:  mariadb -h 127.0.0.1 -u apkaudio -p apkaudio < schema.scanalyzer.mariadb.sql
--         (127.0.0.1:3306 is SQL-Proxy, the cluster's one published port)
--
-- WHAT THIS OWNS
--   The seven tables behind SCAN's cloud corpus: one row per directory, one per
--   audio file, and five feature tables hanging off the file. It is the schema
--   `Web_Front/public/api/{get_peaks,upload_peak,db_status}.php` read and write,
--   and it is authored here, beside scan-api (SCANALYZER.Like.audio/Docker/);
--   DATABASE.server.SQL's Dockerfile.node COPYs it as /opt/apk/schema/20-scanalyzer.mariadb.sql.
--
-- WHY IT IS HERE AND NOT IN init_db.php
--   The statements were only ever expressed as `$pdo->exec()` calls inside
--   `SCAN/Web_Front/tools/api/init_db.php`, a hand-run endpoint aimed at a
--   shared cPanel host. That made the schema a side effect of running a
--   destructive script against somebody else's server: nothing could apply it
--   to the container beside it, and nothing could diff it. This file is the
--   record. `init_db.php` remains the cPanel path and must be kept in step.
--
-- IDEMPOTENT ON PURPOSE. Every statement is CREATE TABLE IF NOT EXISTS, so this
-- is safe against a live corpus. It is NOT the reset — `init_db.php` drops and
-- recreates, and that is the only thing in the tree that is allowed to.
--
-- APPLIED ON EVERY `up`. DATABASE.server.SQL's Dockerfile.node COPYs this file into its image as
-- /opt/apk/schema/20-scanalyzer.mariadb.sql, and SQL-Schema-Init
-- (SRC/tools/apply-schemas.sh) applies it through SQL-Proxy and proves every
-- table exists. To apply it by hand against the running cluster, from the
-- APK.audio root:
--
--   docker exec -i SQL-Node-1 mariadb -uapkaudio -pDEV.DB apkaudio \
--       < 'PODS/POD.database/DATABASE.server.SQL/SRC/schema.scanalyzer.mariadb.sql'

SET NAMES utf8mb4;

-- ----------------------------------------------------------------- paths --
-- One row per DIRECTORY, holding the full path as the analyzer saw it, so a
-- player can reconstruct where a sound lives: CONCAT(full_path,'/',filename).
--
-- Its own table because a library stores thousands of files per folder and
-- repeating a 200-character directory string on each of them is most of the
-- row. Interning it also makes "everything under this folder" an indexed lookup
-- rather than a LIKE over the whole set.
--
-- path_key is a SHA-256 of full_path and carries the UNIQUE index. InnoDB caps
-- an index key at 3072 bytes and utf8mb4 costs 4 bytes per character, so a
-- VARCHAR(1024) cannot be indexed whole; a 255-character PREFIX index would
-- silently treat two paths agreeing in their first 255 characters as one
-- folder, which is exactly what deep sample-library trees look like. The hash
-- compares the path in full at 64 ascii bytes.
CREATE TABLE IF NOT EXISTS paths (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    full_path  VARCHAR(1024) NOT NULL,
    path_key   CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_path_key (path_key),
    KEY idx_full_path (full_path(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- audio_files --
-- Identity is (filename, path_id) against the FULL path. It was once
-- (filename, folder_path) where folder_path was relative to whatever directory
-- the scan started from — so the same file scanned from a different root was a
-- different row, and one library scanned twice from two levels produced two
-- complete sets of rows.
CREATE TABLE IF NOT EXISTS audio_files (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    filename         VARCHAR(255) NOT NULL,
    path_id          INT NOT NULL,
    analyzer_version VARCHAR(255),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_file (filename, path_id),
    KEY idx_path (path_id),
    FOREIGN KEY (path_id) REFERENCES paths (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------- metadata --
CREATE TABLE IF NOT EXISTS metadata (
    file_id        INT PRIMARY KEY,
    length_seconds FLOAT,
    sample_rate    INT,
    bit_depth      INT,
    channels       INT,
    source_format  VARCHAR(50),
    lossy_source   BOOLEAN,
    dc_offset      FLOAT,
    -- How many silence-separated regions the scan found. NULL means a record
    -- uploaded before this column existed, which differs from a measured 1.
    region_count   INT DEFAULT NULL,
    FOREIGN KEY (file_id) REFERENCES audio_files (id) ON DELETE CASCADE,
    -- Indexed because the interesting query is `region_count > 1`.
    KEY idx_region_count (region_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------- classification --
CREATE TABLE IF NOT EXISTS classification (
    file_id           INT PRIMARY KEY,
    ucs_category      VARCHAR(100),
    ucs_subcategory   VARCHAR(100),
    group_name        VARCHAR(100),
    subgroup          VARCHAR(100),
    timbre            VARCHAR(100),
    acoustic_types    VARCHAR(255),
    instrument_family VARCHAR(255),
    reason            TEXT,
    alt_1_group       VARCHAR(100),
    alt_1_sub         VARCHAR(100),
    alt_2_group       VARCHAR(100),
    alt_2_sub         VARCHAR(100),
    alt_3_group       VARCHAR(100),
    alt_3_sub         VARCHAR(100),
    FOREIGN KEY (file_id) REFERENCES audio_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------- spectral_features --
CREATE TABLE IF NOT EXISTS spectral_features (
    file_id                   INT PRIMARY KEY,
    root_mean_square_level    FLOAT,
    crest_factor              FLOAT,
    complexity                FLOAT,
    spectral_centroid_hz      FLOAT,
    spectral_rolloff_hz       FLOAT,
    spectral_flatness         FLOAT,
    harmonicity               FLOAT,
    total_harmonic_distortion FLOAT,
    clipping_density          FLOAT,
    FOREIGN KEY (file_id) REFERENCES audio_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ musicality --
CREATE TABLE IF NOT EXISTS musicality (
    file_id           INT PRIMARY KEY,
    pitch_hz          FLOAT,
    root_note_name    VARCHAR(20),
    root_midi_note    INT,
    root_cents_offset FLOAT,
    beats_per_minute  FLOAT,
    FOREIGN KEY (file_id) REFERENCES audio_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------- envelope --
-- The peak-relative ADSR columns are NULL for a multi-event file: there is no
-- single peak to measure against, so the analyzer stores nothing rather than a
-- number describing the loudest edit point. Readers must keep that null — 0.0
-- would turn "not measurable" into the claim "this sound has no sustain".
CREATE TABLE IF NOT EXISTS envelope (
    file_id           INT PRIMARY KEY,
    transient_count   INT,
    attack_seconds    FLOAT,
    decay_seconds     FLOAT,
    sustain_level     FLOAT,
    release_seconds   FLOAT,
    temporal_centroid FLOAT,
    shape             VARCHAR(100),
    FOREIGN KEY (file_id) REFERENCES audio_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

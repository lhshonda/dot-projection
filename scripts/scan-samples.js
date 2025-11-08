import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLES_DIR = path.join(__dirname, '../public/samples');
const MANIFEST_FILE = path.join(__dirname, '../public/samples-manifest.json');

// Audio file extensions
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.aif', '.aiff', '.m4a', '.flac'];

// Categorization based on folder structure and filename
const categorizeSample = (filePath, relativePath) => {
  const pathLower = relativePath.toLowerCase();
  const filename = path.basename(filePath).toLowerCase();

  // Check folder structure first (most reliable)
  if (pathLower.includes('/kicks/') || pathLower.includes('\\kicks\\')) {
    return 'kick';
  }
  if (pathLower.includes('/snares/') || pathLower.includes('\\snares\\')) {
    return 'snare';
  }
  if (pathLower.includes('/claps/') || pathLower.includes('\\claps\\')) {
    return 'clap';
  }
  if (pathLower.includes('hihats - closed') || pathLower.includes('hihats-closed') || 
      (pathLower.includes('hihat') && pathLower.includes('closed'))) {
    return 'hihat';
  }
  if (pathLower.includes('hihats - open') || pathLower.includes('hihats-open') ||
      (pathLower.includes('hihat') && pathLower.includes('open'))) {
    return 'openhat';
  }
  if (pathLower.includes('/crashes/') || pathLower.includes('\\crashes\\')) {
    return 'crash';
  }
  if (pathLower.includes('/rides/') || pathLower.includes('\\rides\\')) {
    return 'ride';
  }
  if (pathLower.includes('/percussion/') || pathLower.includes('\\percussion\\')) {
    return 'percussion';
  }
  if (pathLower.includes('/impacts/') || pathLower.includes('\\impacts\\')) {
    return 'impact';
  }
  if (pathLower.includes('/risers/') || pathLower.includes('\\risers\\')) {
    return 'riser';
  }
  if (pathLower.includes('/white noise/') || pathLower.includes('white-noise')) {
    return 'whitenoise';
  }
  if (pathLower.includes('loop')) {
    return 'loop';
  }

  // Check filename keywords as fallback
  if (filename.includes('kick')) return 'kick';
  if (filename.includes('snare')) return 'snare';
  if (filename.includes('clap')) return 'clap';
  if (filename.includes('hihat') || filename.includes('hi-hat')) {
    return filename.includes('open') ? 'openhat' : 'hihat';
  }
  if (filename.includes('crash')) return 'crash';
  if (filename.includes('ride')) return 'ride';
  if (filename.includes('perc')) return 'percussion';
  if (filename.includes('impact')) return 'impact';
  if (filename.includes('riser')) return 'riser';
  if (filename.includes('white') && filename.includes('noise')) return 'whitenoise';

  // Default category
  return 'other';
};

// Recursively scan directory for audio files
const scanDirectory = (dir, baseDir = dir) => {
  const samples = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        samples.push(...scanDirectory(fullPath, baseDir));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.includes(ext)) {
          const category = categorizeSample(fullPath, relativePath);
          const webPath = `/samples/${relativePath.replace(/\\/g, '/')}`;
          
          samples.push({
            path: webPath,
            name: entry.name,
            category: category,
            relativePath: relativePath.replace(/\\/g, '/'),
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }
  
  return samples;
};

// Main function
const generateManifest = () => {
  console.log('Scanning samples directory...');
  console.log(`Directory: ${SAMPLES_DIR}`);
  
  if (!fs.existsSync(SAMPLES_DIR)) {
    console.error(`Samples directory not found: ${SAMPLES_DIR}`);
    process.exit(1);
  }
  
  const allSamples = scanDirectory(SAMPLES_DIR);
  
  // Group by category
  const categorized = {};
  allSamples.forEach(sample => {
    if (!categorized[sample.category]) {
      categorized[sample.category] = [];
    }
    categorized[sample.category].push(sample);
  });
  
  // Sort samples within each category by name
  Object.keys(categorized).forEach(category => {
    categorized[category].sort((a, b) => a.name.localeCompare(b.name));
  });
  
  // Create manifest object
  const manifest = {
    generated: new Date().toISOString(),
    totalSamples: allSamples.length,
    categories: Object.keys(categorized).sort(),
    samples: categorized,
    allSamples: allSamples, // Flat list for easy searching
  };
  
  // Write manifest file
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  
  console.log(`\n✅ Manifest generated successfully!`);
  console.log(`📁 File: ${MANIFEST_FILE}`);
  console.log(`📊 Total samples: ${allSamples.length}`);
  console.log(`📂 Categories: ${Object.keys(categorized).join(', ')}`);
  console.log(`\nCategory breakdown:`);
  Object.entries(categorized).forEach(([category, samples]) => {
    console.log(`  ${category}: ${samples.length} samples`);
  });
};

// Run the script
generateManifest();

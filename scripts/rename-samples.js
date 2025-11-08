import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLES_DIR = path.join(__dirname, '../public/samples');

// Characters to replace/remove for URL-safe filenames
const PROBLEMATIC_CHARS = {
  '#': 'sharp',
  '♯': 'sharp',
  '♭': 'flat',
  ' ': '_',  // Replace spaces with underscores
  '/': '-',
  '\\': '-',
  '?': '',
  '*': '',
  '<': '',
  '>': '',
  '|': '',
  '"': '',
  ':': '-',
};

// Make a filename URL-safe
const sanitizeName = (name) => {
  let sanitized = name;
  
  // Replace problematic characters
  Object.entries(PROBLEMATIC_CHARS).forEach(([char, replacement]) => {
    sanitized = sanitized.split(char).join(replacement);
  });
  
  // Remove consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores and hyphens
  sanitized = sanitized.replace(/^[_-]+|[_-]+$/g, '');
  
  // Ensure it's not empty
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'unnamed';
  }
  
  return sanitized;
};

// Recursively rename files and directories
const renameRecursive = (dir, baseDir = dir, renameLog = []) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    // Process directories first, then files
    const dirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => e.isFile());
    
    // Rename directories
    for (const entry of dirs) {
      const oldPath = path.join(dir, entry.name);
      const sanitizedName = sanitizeName(entry.name);
      
      if (sanitizedName !== entry.name) {
        const newPath = path.join(dir, sanitizedName);
        
        // Check if target already exists
        if (fs.existsSync(newPath)) {
          console.warn(`⚠️  Target already exists, skipping: ${newPath}`);
          continue;
        }
        
        try {
          fs.renameSync(oldPath, newPath);
          const relativeOld = path.relative(baseDir, oldPath);
          const relativeNew = path.relative(baseDir, newPath);
          renameLog.push({
            type: 'directory',
            old: relativeOld.replace(/\\/g, '/'),
            new: relativeNew.replace(/\\/g, '/'),
          });
          console.log(`📁 Renamed directory: ${entry.name} → ${sanitizedName}`);
          
          // Recursively process the renamed directory
          renameRecursive(newPath, baseDir, renameLog);
        } catch (error) {
          console.error(`❌ Error renaming directory ${oldPath}:`, error.message);
        }
      } else {
        // Name is already safe, just recurse
        renameRecursive(oldPath, baseDir, renameLog);
      }
    }
    
    // Rename files
    for (const entry of files) {
      const oldPath = path.join(dir, entry.name);
      const ext = path.extname(entry.name);
      const baseName = path.basename(entry.name, ext);
      const sanitizedName = sanitizeName(baseName) + ext;
      
      if (sanitizedName !== entry.name) {
        const newPath = path.join(dir, sanitizedName);
        
        // Check if target already exists
        if (fs.existsSync(newPath)) {
          console.warn(`⚠️  Target already exists, skipping: ${newPath}`);
          continue;
        }
        
        try {
          fs.renameSync(oldPath, newPath);
          const relativeOld = path.relative(baseDir, oldPath);
          const relativeNew = path.relative(baseDir, newPath);
          renameLog.push({
            type: 'file',
            old: relativeOld.replace(/\\/g, '/'),
            new: relativeNew.replace(/\\/g, '/'),
          });
          console.log(`📄 Renamed file: ${entry.name} → ${sanitizedName}`);
        } catch (error) {
          console.error(`❌ Error renaming file ${oldPath}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error.message);
  }
  
  return renameLog;
};

// Main function
const renameSamples = () => {
  console.log('🧹 Sanitizing sample file and folder names...');
  console.log(`Directory: ${SAMPLES_DIR}\n`);
  
  if (!fs.existsSync(SAMPLES_DIR)) {
    console.error(`❌ Samples directory not found: ${SAMPLES_DIR}`);
    process.exit(1);
  }
  
  const renameLog = renameRecursive(SAMPLES_DIR);
  
  console.log(`\n✅ Renaming complete!`);
  console.log(`📊 Total items renamed: ${renameLog.length}`);
  
  if (renameLog.length > 0) {
    const logFile = path.join(__dirname, '../public/samples-rename-log.json');
    fs.writeFileSync(logFile, JSON.stringify(renameLog, null, 2));
    console.log(`📝 Rename log saved to: ${logFile}`);
    
    console.log(`\n📋 Summary:`);
    const dirs = renameLog.filter(item => item.type === 'directory').length;
    const files = renameLog.filter(item => item.type === 'file').length;
    console.log(`   Directories: ${dirs}`);
    console.log(`   Files: ${files}`);
  } else {
    console.log(`✨ No files needed renaming - all names are already URL-safe!`);
  }
  
  console.log(`\n💡 Next step: Run 'npm run scan-samples' to update the manifest.`);
};

// Run the script
renameSamples();


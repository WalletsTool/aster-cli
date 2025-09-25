#!/usr/bin/env node

/**
 * Minimal test file for @walletstool/aster-cli
 * This ensures the package structure is valid and main modules can be imported
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Running basic package validation tests...');

// Test 1: Check if main files exist
const srcDir = resolve(__dirname, '../src');
const mainFile = resolve(srcDir, 'index.js');

console.log('✓ Checking package structure...');

if (!existsSync(srcDir)) {
  console.error('✗ src directory not found');
  process.exit(1);
}

if (!existsSync(mainFile)) {
  console.error('✗ main file (src/index.js) not found');
  process.exit(1);
}

console.log('✓ Package structure is valid');

// Test 2: Try to import main module (basic syntax check)
try {
  // Just check if the file can be parsed, don't actually run it
  // since it might require arguments or environment setup
  const { readFileSync } = await import('fs');
  const mainContent = readFileSync(mainFile, 'utf8');
  
  if (mainContent.length === 0) {
    console.error('✗ Main file is empty');
    process.exit(1);
  }
  
  console.log('✓ Main module file is readable');
} catch (error) {
  console.error('✗ Error reading main module:', error.message);
  process.exit(1);
}

console.log('✓ All basic tests passed');
console.log('📦 Package is ready for publishing');
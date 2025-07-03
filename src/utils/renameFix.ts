import * as fs from 'fs';
import * as path from 'path';

export function fixFileNames() {
  const interactionsPath = path.join(process.cwd(), 'src/interactions');
  
  // Check if pollButtonts.ts exists and rename to pollButtons.ts
  const wrongName = path.join(interactionsPath, 'pollButtonts.ts');
  const correctName = path.join(interactionsPath, 'pollButtons.ts');
  
  if (fs.existsSync(wrongName)) {
    fs.renameSync(wrongName, correctName);
    console.log('✅ Renamed pollButtonts.ts to pollButtons.ts');
  }
  
  // Ensure all required files exist
  const requiredFiles = [
    'src/interactions/ticketButtons.ts',
    'src/interactions/pollButtons.ts',
    'src/events/interactionCreate.ts',
    'src/events/messageCreate.ts',
    'src/events/ready.ts'
  ];
  
  requiredFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Missing required file: ${file}`);
    } else {
      console.log(`✅ Found: ${file}`);
    }
  });
}
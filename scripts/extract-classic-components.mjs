import { execSync } from 'child_process';
import fs from 'fs';

function gitFile(path) {
  return execSync(`git show a716e80:${path}`, { encoding: 'utf8' });
}

function renameExport(src, from, to) {
  return src
    .replace(new RegExp(`const ${from}:`, 'g'), `const ${to}:`)
    .replace(new RegExp(`export default ${from};`), `export default ${to};`);
}

function save(path, content) {
  fs.writeFileSync(path, content, 'utf8');
  console.log('wrote', path);
}

// ApprovedSongsComponentsClassic
save(
  'src/components/ApprovedSongsComponentsClassic.tsx',
  gitFile('src/components/ApprovedSongsComponents.tsx')
);

let approvedClassic = renameExport(gitFile('src/components/ApprovedSongs.tsx'), 'ApprovedSongs', 'ApprovedSongsClassic');
approvedClassic = approvedClassic.replace(
  "from './ApprovedSongsComponents'",
  "from './ApprovedSongsComponentsClassic'"
);
save('src/components/ApprovedSongsClassic.tsx', approvedClassic);

// SetListFormClassic
save(
  'src/components/SetList/components/SetListFormClassic.tsx',
  renameExport(gitFile('src/components/SetList/components/SetListForm.tsx'), 'SetListForm', 'SetListFormClassic')
);

// SetListManagerClassic
let managerClassic = gitFile('src/components/SetList/SetListManager.tsx');
managerClassic = managerClassic.replace(
  "from './components/SetListForm'",
  "from './components/SetListFormClassic'"
);
managerClassic = renameExport(managerClassic, 'SetListManager', 'SetListManagerClassic');
save('src/components/SetList/SetListManagerClassic.tsx', managerClassic);

// SetListClassic
let setListClassic = renameExport(gitFile('src/components/SetList.tsx'), 'SetList', 'SetListClassic');
setListClassic = setListClassic.replace(
  "import SetListManager from './SetList/SetListManager'",
  "import SetListManagerClassic from './SetList/SetListManagerClassic'"
);
setListClassic = setListClassic.replace(/<SetListManager\b/g, '<SetListManagerClassic');
save('src/components/SetListClassic.tsx', setListClassic);

// PracticeRoomBookingClassic
save(
  'src/components/PracticeRoomBookingClassic.tsx',
  renameExport(gitFile('src/components/PracticeRoomBooking.tsx'), 'PracticeRoomBooking', 'PracticeRoomBookingClassic')
);

save(
  'src/components/ContestCreateClassic.tsx',
  renameExport(gitFile('src/components/ContestCreate.tsx'), 'ContestCreate', 'ContestCreateClassic')
);

function ensureNotebook(srcPath, notebookPath, componentName) {
  if (fs.existsSync(notebookPath)) return;
  const src = fs.readFileSync(srcPath, 'utf8');
  if (src.includes(`${componentName}Notebook`)) return;
  save(notebookPath, renameExport(src, componentName, `${componentName}Notebook`));
}

ensureNotebook('src/components/ApprovedSongs.tsx', 'src/components/ApprovedSongsNotebook.tsx', 'ApprovedSongs');
ensureNotebook('src/components/SetList.tsx', 'src/components/SetListNotebook.tsx', 'SetList');
ensureNotebook(
  'src/components/PracticeRoomBooking.tsx',
  'src/components/PracticeRoomBookingNotebook.tsx',
  'PracticeRoomBooking'
);
ensureNotebook('src/components/ContestCreate.tsx', 'src/components/ContestCreateNotebook.tsx', 'ContestCreate');

console.log('done');

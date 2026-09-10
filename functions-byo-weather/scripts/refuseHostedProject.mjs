/**
 * Stop a deploy that would land on PUFworks' hosted Firebase.
 * Design A: George never holds a third-party DPIRD key.
 */
const HOSTED = new Set(['pufworks-am', 'gen-lang-client-0444791425']);
const PLACEHOLDER = 'YOUR_FIREBASE_PROJECT_ID';

const project =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.FIREBASE_PROJECT ||
  '';

if (!project || project === PLACEHOLDER) {
  console.error(
    '[byo-weather] No Firebase project selected. From this folder run:\n' +
      '  firebase use --add\n' +
      'and pick YOUR project — never the PUFworks hosted one.'
  );
  process.exit(1);
}

if (HOSTED.has(project)) {
  console.error(
    '[byo-weather] Refusing to deploy to the PUFworks hosted project.\n' +
      'This package holds YOUR DPIRD key in YOUR Secret Manager. Use firebase use --add on your own project.'
  );
  process.exit(1);
}

console.log(`[byo-weather] Deploy target ${project} (not hosted).`);

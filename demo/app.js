const DATA_URL = './data/compiler-examples.json?v=0.2-scope.1';

const tabs = [...document.querySelectorAll('[data-example]')];
const elements = {
  eyebrow: document.querySelector('#example-eyebrow'),
  title: document.querySelector('#example-title'),
  summary: document.querySelector('#example-summary'),
  verdict: document.querySelector('#example-verdict'),
  spec: document.querySelector('#spec-output'),
  diagnostics: document.querySelector('#diagnostic-list'),
  diagnosticCount: document.querySelector('#diagnostic-count'),
  decisions: document.querySelector('#decision-list'),
  decisionCount: document.querySelector('#decision-count'),
  artifact: document.querySelector('#artifact-output'),
  artifactLabel: document.querySelector('#artifact-label'),
  artifactStatus: document.querySelector('#artifact-status'),
  layerSummary: document.querySelector('#layer-summary'),
  boundary: document.querySelector('#compiler-boundary'),
  copy: document.querySelector('#copy-spec'),
};

let examples = [];
let activeId = 'unsafe-count';

bindTabs();
elements.copy.addEventListener('click', copySpec);

try {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  examples = payload.examples;
  elements.boundary.textContent = `${payload.boundary} Package ${payload.package_version}.`;
  render();
} catch (error) {
  elements.title.textContent = 'Compiler snapshot unavailable';
  elements.summary.textContent =
    error instanceof Error ? error.message : String(error);
  elements.verdict.textContent = 'ERROR';
  elements.verdict.dataset.verdict = 'rejected';
}

function bindTabs() {
  for (const tab of tabs) {
    tab.addEventListener('click', () => setActive(tab.dataset.example));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      setActive(next.dataset.example);
      next.focus();
    });
  }
}

function setActive(id) {
  activeId = id;
  for (const tab of tabs) {
    const selected = tab.dataset.example === id;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  render();
}

function render() {
  const example = examples.find((item) => item.id === activeId);
  if (example === undefined) return;

  elements.eyebrow.textContent = example.eyebrow;
  elements.title.textContent = example.title;
  elements.summary.textContent = example.summary;
  elements.verdict.textContent =
    example.verdict === 'compiled' ? 'COMPILED' : 'REJECTED';
  elements.verdict.dataset.verdict = example.verdict;
  elements.spec.textContent = example.document;
  elements.diagnosticCount.textContent = String(example.diagnostics.length);
  elements.decisionCount.textContent = String(example.decisions.length);

  renderDiagnostics(example.diagnostics);
  renderDecisions(example.decisions, example.verdict);
  renderArtifact(example.artifact);
}

function renderDiagnostics(diagnostics) {
  elements.diagnostics.replaceChildren();
  if (diagnostics.length === 0) {
    elements.diagnostics.append(
      emptyState('No blocking diagnostics.', 'The semantic contract passed.'),
    );
    return;
  }

  for (const diagnostic of diagnostics) {
    const card = document.createElement('article');
    card.className = `diagnostic diagnostic-${diagnostic.severity}`;
    const header = document.createElement('div');
    const code = document.createElement('strong');
    code.textContent = diagnostic.code;
    const severity = document.createElement('span');
    severity.textContent = diagnostic.severity;
    header.append(code, severity);
    const message = document.createElement('p');
    message.textContent = diagnostic.message;
    const path = document.createElement('code');
    path.textContent = diagnostic.path;
    card.append(header, message, path);
    elements.diagnostics.append(card);
  }
}

function renderDecisions(decisions, verdict) {
  elements.decisions.replaceChildren();
  if (decisions.length === 0) {
    elements.decisions.append(
      emptyState(
        'No compiler decisions.',
        verdict === 'rejected'
          ? 'Compilation stopped at semantic validation.'
          : 'No inference was required.',
      ),
    );
    return;
  }

  for (const decision of decisions) {
    const card = document.createElement('article');
    card.className = 'decision';
    const code = document.createElement('strong');
    code.textContent = decision.code;
    const reason = document.createElement('p');
    reason.textContent = decision.reason;
    const value = document.createElement('code');
    value.textContent = JSON.stringify(decision.value);
    card.append(code, reason, value);
    elements.decisions.append(card);
  }
}

function renderArtifact(artifact) {
  elements.layerSummary.replaceChildren();
  if (artifact === null) {
    elements.artifactLabel.textContent = 'Renderer artifact';
    elements.artifactStatus.textContent = 'NOT EMITTED';
    elements.artifact.textContent =
      'Compilation failed closed.\nNo renderer configuration was produced.';
    elements.artifact.classList.add('artifact-empty');
    return;
  }

  elements.artifact.classList.remove('artifact-empty');
  elements.artifactLabel.textContent = `${artifact.renderer} artifact`;
  elements.artifactStatus.textContent = `${artifact.layers.length} LAYERS`;
  for (const layer of artifact.layers) {
    const chip = document.createElement('span');
    chip.textContent = `${layer.type} · ${layer.id}`;
    elements.layerSummary.append(chip);
  }
  elements.artifact.textContent = artifact.excerpt ?? '{}';
}

function emptyState(title, detail) {
  const card = document.createElement('div');
  card.className = 'empty-state';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = detail;
  card.append(strong, span);
  return card;
}

async function copySpec() {
  try {
    await navigator.clipboard.writeText(elements.spec.textContent);
    elements.copy.textContent = 'Copied';
  } catch {
    elements.copy.textContent = 'Copy failed';
  }
  window.setTimeout(() => {
    elements.copy.textContent = 'Copy';
  }, 1400);
}

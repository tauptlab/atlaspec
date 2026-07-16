export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string;
}

export interface ValidationReport {
  valid: boolean;
  diagnostics: Diagnostic[];
}

export function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const severityOrder: Record<DiagnosticSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return (
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

declare module '*.json' {
  interface EPSGDefinition {
    code: string;
    kind: string;
    name: string;
    proj4: string | null;
    unit: string | null;
    area: string | null;
  }

  const definitions: Record<string, EPSGDefinition>;
  export default definitions;
}

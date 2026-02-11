export function parsePolicyId(policyContent: string): string | null {
  const match = policyContent.trim().match(/^\s*@id\s*\(\s*"([^"]+)"\s*\)/)
  return match ? match[1] : null
}

export function stripPolicyId(policyContent: string): string {
  return policyContent.trim().replace(/^\s*@id\s*\(\s*"[^"]+"\s*\)\s*\n?/, '')
}

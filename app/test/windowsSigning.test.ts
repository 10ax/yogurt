import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows releases are signed by Microsoft's Artifact Signing once its secrets exist; until then they build unsigned
const root = join(__dirname, '../..')
const preview = readFileSync(join(root, '.github/workflows/preview.yml'), 'utf8')
const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')

describe('Windows signing', () => {
  it('release.yml lets the Windows build ask GitHub for a sign-in token', () => {
    expect(release).toMatch(/uses: \.\/\.github\/workflows\/preview\.yml[\s\S]*?id-token: write/)
  })
  it('a release signs in to Azure with that token (no stored secret), only in the signing environment, and checks the signature', () => {
    expect(preview).not.toContain('AZURE_CLIENT_SECRET')
    expect(preview).toContain("environment: ${{ inputs.release && 'signing' || '' }}")
    expect(preview).toMatch(/uses: azure\/login@[0-9a-f]{40}/)
    for (const v of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID']) expect(preview).toContain(`vars.${v}`)
    expect(preview).toContain('azureSignOptions.codeSigningAccountName=yogurt-signing')
    expect(preview).toContain('azureSignOptions.endpoint=https://eus.codesigning.azure.net/')
    expect(preview).toContain('Get-AuthenticodeSignature')
  })
})

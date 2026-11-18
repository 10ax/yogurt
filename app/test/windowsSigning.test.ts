import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows releases are signed by Microsoft's Artifact Signing once its secrets exist; until then they build unsigned
const root = join(__dirname, '../..')
const preview = readFileSync(join(root, '.github/workflows/preview.yml'), 'utf8')
const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')

describe('Windows signing', () => {
  it('release.yml hands its secrets to the Windows build', () => {
    expect(release).toMatch(/uses: \.\/\.github\/workflows\/preview\.yml[\s\S]*?secrets: inherit/)
  })
  it('a release signs with Artifact Signing only when the secrets are there, and checks the signature', () => {
    for (const v of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) expect(preview).toContain(`secrets.${v}`)
    expect(preview).toContain('azureSignOptions.codeSigningAccountName=yogurt-signing')
    expect(preview).toContain('azureSignOptions.endpoint=https://eus.codesigning.azure.net/')
    expect(preview).toContain('Get-AuthenticodeSignature')
  })
})

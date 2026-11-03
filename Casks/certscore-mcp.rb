cask "certscore-mcp" do
  version "0.2.33"
  sha256 "3c90e07e9ff100b7261e82873f0ca9fa2ee4a8e23fa8a807a48d14c240119448"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.33/certscore-mcp-v0.2.33.tar.gz"
  name "CertScore.ai MCP"
  desc "CertScore.ai MCP stdio server for public website risk-signal workflows"
  homepage "https://certscore.ai/developers/mcp"

  depends_on formula: "node@22"

  binary "certscore-mcp-v#{version}/bin/certscore-mcp"

  caveats <<~EOS
    Verify the install with:
      certscore-mcp --version
      certscore-mcp --help
      CERTSCORE_API_KEY=<token> certscore-mcp doctor
  EOS
end

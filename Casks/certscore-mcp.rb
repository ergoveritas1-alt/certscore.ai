cask "certscore-mcp" do
  version "0.2.34"
  sha256 "f4898b5ab031416fd82481568dd9ab34872b78b924da55a3ab89fe6e150b3683"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.34/certscore-mcp-v0.2.34.tar.gz"
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

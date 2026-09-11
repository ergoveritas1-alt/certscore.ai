cask "certscore-mcp" do
  version "0.2.21"
  sha256 "83be20f3be6de6dceaa4a9ad9f5b10436f32db445bb690ef7ab9cbd02e35bf6f"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.21/certscore-mcp-v0.2.21.tar.gz"
  name "CertScore MCP"
  desc "CertScore MCP stdio server for public website risk-signal workflows"
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

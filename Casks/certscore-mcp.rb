cask "certscore-mcp" do
  version "0.1.4"
  sha256 "a0f46654fe673d4070f42d331a5cb44c6abb4ca39c7cb1ede38baaa4d6d5b1ce"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.1.4/certscore-mcp-v0.1.4.tar.gz"
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

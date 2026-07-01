cask "certscore-mcp" do
  version "0.1.3"
  sha256 "e8820a560790283a74a398dffb6f8b61491602c96e27343ed7c0902f2162dbe4"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.1.3/certscore-mcp-v0.1.3.tar.gz"
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

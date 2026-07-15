cask "certscore-mcp" do
  version "0.2.8"
  sha256 "a67b3d0da8e4c07d82cd50eff80b703ea5a69c1a3133055531537e065a9417cb"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.8/certscore-mcp-v0.2.8.tar.gz"
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

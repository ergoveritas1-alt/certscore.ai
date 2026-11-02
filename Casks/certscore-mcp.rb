cask "certscore-mcp" do
  version "0.2.32"
  sha256 "0b99c4932412ef5fc74bc3aaf84fde689d800b4a13b7ce8dfcf39ae4b99a03e0"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.32/certscore-mcp-v0.2.32.tar.gz"
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

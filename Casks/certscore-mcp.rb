cask "certscore-mcp" do
  version "0.2.22"
  sha256 "25106323cbb19f2436e5151671f25790643eeb307685bdba2e9a8e59bea4c154"

  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.22/certscore-mcp-v0.2.22.tar.gz"
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

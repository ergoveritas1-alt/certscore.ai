class CertscoreMcp < Formula
  desc "CertScore.ai MCP stdio server for public website risk-signal workflows"
  homepage "https://certscore.ai/developers/mcp"
  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.33/certscore-mcp-v0.2.33.tar.gz"
  sha256 "3c90e07e9ff100b7261e82873f0ca9fa2ee4a8e23fa8a807a48d14c240119448"
  version "0.2.33"
  license "UNLICENSED"

  depends_on "node@22"

  def install
    libexec.install Dir["libexec/*"]
    (bin/"certscore-mcp").write <<~EOS
      #!/usr/bin/env bash
      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/certscore-mcp.mjs" "$@"
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/certscore-mcp --version")
  end
end

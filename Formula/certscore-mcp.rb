class CertscoreMcp < Formula
  desc "CertScore MCP stdio server for public website risk-signal workflows"
  homepage "https://certscore.ai/developers/mcp"
  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.1.4/certscore-mcp-v0.1.4.tar.gz"
  sha256 "a0f46654fe673d4070f42d331a5cb44c6abb4ca39c7cb1ede38baaa4d6d5b1ce"
  version "0.1.4"
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

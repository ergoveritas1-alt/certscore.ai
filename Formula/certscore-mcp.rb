class CertscoreMcp < Formula
  desc "CertScore MCP stdio server for public website risk-signal workflows"
  homepage "https://certscore.ai/developers/mcp"
  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.19/certscore-mcp-v0.2.19.tar.gz"
  sha256 "ddc422f9f4baab8e3a0b8758baed0a9e481d0231b045b8e091e27a6484023489"
  version "0.2.19"
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

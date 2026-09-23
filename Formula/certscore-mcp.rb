class CertscoreMcp < Formula
  desc "CertScore MCP stdio server for public website risk-signal workflows"
  homepage "https://certscore.ai/developers/mcp"
  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.22/certscore-mcp-v0.2.22.tar.gz"
  sha256 "25106323cbb19f2436e5151671f25790643eeb307685bdba2e9a8e59bea4c154"
  version "0.2.22"
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

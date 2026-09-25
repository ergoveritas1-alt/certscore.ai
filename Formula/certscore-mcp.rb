class CertscoreMcp < Formula
  desc "CertScore MCP stdio server for public website risk-signal workflows"
  homepage "https://certscore.ai/developers/mcp"
  url "https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.23/certscore-mcp-v0.2.23.tar.gz"
  sha256 "0d8a47824de50384fcd40411fa397100349162f0dc18814a72b86ab9f7076f14"
  version "0.2.23"
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

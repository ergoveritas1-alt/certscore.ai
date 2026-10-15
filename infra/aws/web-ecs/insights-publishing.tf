# Static public content only. This role cannot rebuild or replace the app.
# The scoped bootstrap script creates these without applying unrelated drift.
import {
  to = aws_iam_role.insights_publisher
  id = "certscore-web-insights-publisher"
}
import {
  to = aws_iam_role_policy.insights_publisher
  id = "certscore-web-insights-publisher:public-insights-only"
}
resource "aws_iam_role" "insights_publisher" {
  name = "${local.prefix}-insights-publisher"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "repo:ergoveritas1-alt/certscore.ai:environment:insights-production"
      } }
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "insights_publisher" {
  name = "public-insights-only"
  role = aws_iam_role.insights_publisher.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = "arn:aws:s3:::${var.s3_bucket}/public-insights/*"
      },
      {
        Effect = "Allow"
        Action = "s3:ListBucket"
        Resource = "arn:aws:s3:::${var.s3_bucket}"
        Condition = { StringLike = { "s3:prefix" = "public-insights/*" } }
      }
    ]
  })
}

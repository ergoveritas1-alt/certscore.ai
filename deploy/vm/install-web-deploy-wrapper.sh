#!/usr/bin/env bash
set -euo pipefail

REMOTE_WRAPPER_PATH="${REMOTE_WRAPPER_PATH:-/usr/local/bin/deploy-certscore-web}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/etc/certscore-web.env}"
CONTAINER_NAME="${CONTAINER_NAME:-certscore-web}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
ALLOWED_USER="${ALLOWED_USER:-benmasek}"
SUDOERS_PATH="${SUDOERS_PATH:-/etc/sudoers.d/certscore-web-deploy}"

tmp_script="$(mktemp)"
tmp_sudoers="$(mktemp)"

cleanup() {
  rm -f "${tmp_script}" "${tmp_sudoers}"
}

trap cleanup EXIT

cat > "${tmp_script}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [[ \$# -ne 1 ]]; then
  echo "usage: deploy-certscore-web <image-uri>" >&2
  exit 1
fi

image_uri="\$1"
container_name="${CONTAINER_NAME}"
container_port="${CONTAINER_PORT}"
remote_env_file="${REMOTE_ENV_FILE}"
filtered_env_file=""

cleanup() {
  if [[ -n "\${filtered_env_file}" && -f "\${filtered_env_file}" ]]; then
    rm -f "\${filtered_env_file}"
  fi
}

trap cleanup EXIT

if [[ ! -f "\${remote_env_file}" ]]; then
  echo "Missing env file: \${remote_env_file}" >&2
  exit 1
fi

filtered_env_file="\$(mktemp)"
grep -v -E '^BUILD_(GIT_REF|GIT_SHA|IMAGE_TAG|RUNTIME_TARGET)=' "\${remote_env_file}" > "\${filtered_env_file}"

docker pull "\${image_uri}"
docker rm -f "\${container_name}" >/dev/null 2>&1 || true
docker run -d \
  --name "\${container_name}" \
  --restart unless-stopped \
  --env-file "\${filtered_env_file}" \
  -p "\${container_port}:3000" \
  "\${image_uri}"

deadline=\$((SECONDS + 120))
until curl -fsS "http://127.0.0.1:\${container_port}/login" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for \${container_name} to serve /login" >&2
    docker logs --tail 200 "\${container_name}" >&2 || true
    exit 1
  fi
  sleep 2
done

curl -fsS "http://127.0.0.1:\${container_port}/api/health/database" >/dev/null
EOF

chmod 0755 "${tmp_script}"

cat > "${tmp_sudoers}" <<EOF
${ALLOWED_USER} ALL=(root) NOPASSWD: ${REMOTE_WRAPPER_PATH}
EOF

echo "Installing ${REMOTE_WRAPPER_PATH} and ${SUDOERS_PATH}"
sudo install -o root -g root -m 0755 "${tmp_script}" "${REMOTE_WRAPPER_PATH}"
sudo install -o root -g root -m 0440 "${tmp_sudoers}" "${SUDOERS_PATH}"
sudo visudo -cf "${SUDOERS_PATH}"

echo "Installed wrapper for ${ALLOWED_USER}"

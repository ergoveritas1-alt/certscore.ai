FROM public.ecr.aws/amazonlinux/amazonlinux:2023
RUN dnf install -y squid && dnf clean all
CMD ["squid", "-N", "-f", "/proof/squid.conf"]

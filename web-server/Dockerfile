FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html

# daemon off keeps nginx running in the foreground
RUN nginx -g 'daemon off;'
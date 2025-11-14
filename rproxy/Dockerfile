FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf

# daemon off keeps nginx running in the foreground
CMD ["nginx", "-g", "daemon off;"]
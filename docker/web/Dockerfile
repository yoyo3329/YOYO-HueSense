FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libcurl4-openssl-dev \
       libonig-dev \
    && docker-php-ext-install curl mbstring \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html/color-search-test
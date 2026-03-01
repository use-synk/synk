# Contributing

Thank you for your interest in contributing to `synk`. We welcome all contributions, big and small. Please read the following guidelines before you start contributing.

## Setup

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) for database and caching services
- [Bun](https://bun.sh/docs/installation) `1.3.9` or newer as the package manager and runtime
- [ngrok](https://ngrok.com/download) for routing webhook events to the development server

### Steps

1. **Fork the repository**
    Create a fork of the repository to your own GitHub account.

2. **Clone the repository**
    Clone the repository to your own machine using the following command:
    
    ```bash
    git clone https://github.com/your-username/synk.git
    ```

3. **Install dependencies**
    Install the dependencies using the following command:

    ```bash
    bun install
    ```

4. **Run the development server**
    Run the development server using the following command:

    ```bash
    bun dev
    ```

## Engineering Standards

Monorepo package and task conventions are defined in `docs/MONOREPO-STANDARDS.md`.
All workspace scripts and Turborepo task changes should follow that document.

# Contributing

Thank you for your interest in contributing to `synk`. We welcome all contributions, big and small. Please read the following guidelines before you start contributing.

## Setup

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) for database and caching services
- [pnpm](https://pnpm.io/installation) as the package manager for the project
- [node](https://nodejs.org/en/download/) minimum version 22 (use [nvm](https://github.com/nvm-sh/nvm) to install and manage node versions)
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
    pnpm install
    ```

4. **Run the development server**
    Run the development server using the following command:

    ```bash
    pnpm dev
    ```
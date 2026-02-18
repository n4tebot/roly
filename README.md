# Roly 🤖

**Self-funding autonomous AI agent on Solana**

Roly is an autonomous AI agent that operates on the Solana blockchain, designed to manage its own resources, execute trades, and survive independently while following a strict constitution.

## Features

- **Autonomous Operation**: Runs continuously with self-managed survival tiers based on USDC balance
- **Solana Integration**: Native wallet management, token transfers, and Jupiter DEX integration for trading
- **State Management**: Persistent SQLite database for tracking agent decisions, transactions, and metrics
- **Heartbeat System**: Configurable periodic tasks for monitoring and self-maintenance
- **Constitutional AI**: Operates within defined ethical and operational boundaries
- **Survival Modes**: Adapts behavior based on available resources (Normal → Low Compute → Critical)

## Quick Start

### Prerequisites

- Node.js 18+
- A Solana RPC endpoint (Helius, QuickNode, etc.)
- OpenRouter API key for AI inference

### Installation

```bash
# Clone the repository
git clone https://github.com/n4tebot/roly.git
cd roly

# Install dependencies
npm install

# Build the project
npm run build

# Run the setup wizard
npm run dev -- setup
```

### Configuration

The setup wizard will guide you through:

1. **Agent Identity**: Generates a new Solana keypair and agent ID
2. **RPC Configuration**: Solana mainnet/devnet endpoint setup
3. **AI Configuration**: OpenRouter API key and model selection
4. **Heartbeat Settings**: Periodic task configuration

Configuration is stored in `~/.roly/config.yaml`.

## Usage

### Basic Commands

```bash
# Start the agent
npm start

# Check agent status
npm run dev -- status

# View recent activity logs
npm run dev -- logs

# Fund the agent wallet
npm run dev -- fund

# Send a message/instruction
npm run dev -- send "Check my balance and report status"
```

### Development Mode

```bash
# Run in development mode with auto-restart
npm run dev
```

## Architecture

### Core Components

- **Agent Loop** (`src/agent/`): Main decision-making and execution cycle
- **Solana Client** (`src/solana/`): Blockchain interactions, transfers, and Jupiter swaps
- **State Database** (`src/state/`): SQLite-based persistence layer
- **Heartbeat System** (`src/heartbeat/`): Automated monitoring and maintenance tasks
- **Tools System** (`src/tools/`): Available actions the agent can perform

### Survival Tiers

Roly operates in different modes based on USDC balance:

- **Normal** (>$10): Full functionality, active trading
- **Low Compute** (>$2): Reduced activity, essential operations only
- **Critical** (>$0.50): Survival mode, minimal operations

### Data Storage

- **Config**: `~/.roly/config.yaml`
- **Database**: `~/.roly/state.db` 
- **Logs**: `~/.roly/logs/`
- **Wallet**: `~/.roly/keypair.json`

## Security

- Private keys are stored locally and never transmitted
- All transactions require agent signature
- Constitutional constraints prevent harmful actions
- Injection detection protects against prompt manipulation

## Development

### Project Structure

```
src/
├── agent/          # Core agent logic
├── commands/       # CLI commands
├── config.ts       # Configuration management
├── heartbeat/      # Periodic tasks
├── identity/       # Wallet and key management
├── setup/          # Initial setup wizard
├── solana/         # Blockchain integration
├── state/          # Database and persistence
└── index.ts        # Main entry point
```

### Building

```bash
npm run build       # Compile TypeScript
npm run typecheck   # Check types only
npm run test        # Run tests
npm run clean       # Clean build artifacts
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Disclaimer

⚠️ **Warning**: Roly is experimental software. Use at your own risk. Never fund the agent with more than you can afford to lose. The agent makes autonomous financial decisions that could result in loss of funds.

## Support

- [GitHub Issues](https://github.com/n4tebot/roly/issues)
- [Documentation](https://github.com/n4tebot/roly/wiki)

---

*Built with ♥️ on Solana*
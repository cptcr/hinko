# 🤖 Pegasus Discord Bot

A feature-rich, multi-guild Discord bot with a comprehensive XP system, customizable level cards, and multi-language support (English/German).

## ✨ Features

### 🎯 Core Features
- **Multi-Guild Support** - Works across multiple Discord servers
- **XP System** - Fully customizable experience point system
- **Level Cards** - Beautiful, customizable level progression cards
- **Multi-Language** - English and German support with easy expansion
- **Admin Controls** - Comprehensive moderation and management tools

### 📊 XP System
- **Automatic XP Gain** - Users gain XP by sending messages
- **Customizable Rates** - Adjustable XP amounts and cooldowns per server
- **Level Rewards** - Automatic role assignment on level up
- **Leaderboards** - Total and monthly (28-day cycle) leaderboards
- **XP Freeze** - Moderators can temporarily suspend XP gain
- **XP Reset** - Admin tools for resetting user or server XP

### 🎨 Level Card Customization
- **Themes** - Multiple built-in themes (Default, Dark, Blue, Green, Purple, Red, Gold)
- **Custom Colors** - Hex color customization
- **Background Images** - Custom background image support
- **Dynamic Progress** - Real-time XP progress visualization

### 🛠️ Admin Features
- **Dynamic Help** - Auto-updating help system based on user permissions
- **Permission Handling** - Role-based command access
- **Freeze System** - Temporary or permanent XP suspension
- **Bulk Operations** - Server-wide XP management
- **Automatic Resets** - Monthly leaderboard cycles

## 🚀 Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (NeonDB recommended)
- Discord Bot Token

### 1. Clone and Install
```bash
git clone <repository-url>
cd pegasus-bot
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and fill in your credentials:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_bot_client_id_here
GUILD_ID=your_test_guild_id_here  # Optional: for testing

# Database Configuration (NeonDB PostgreSQL)
DATABASE_URL=postgresql://username:password@hostname:port/database?sslmode=require

# Optional: XP System Defaults
XP_MIN=15
XP_MAX=25
XP_COOLDOWN=60000
XP_RATE=1.0
```

### 3. Database Setup
```bash
# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push

# Optional: Open Prisma Studio
npm run db:studio
```

### 4. Deploy Commands
```bash
# Deploy to test guild (if GUILD_ID is set)
npm run deploy

# Deploy globally (takes up to 1 hour to propagate)
npm run deploy -- --global

# Force deploy to specific guild
npm run deploy -- --guild
```

### 5. Start the Bot
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 📋 Commands

### General Commands
- `/help [command]` - Show help information
- `/level [user]` - Display level card and stats
- `/leaderboard [monthly] [limit]` - Show server rankings
- `/customize <category> [value]` - Customize level card appearance

### Admin Commands (Requires Administrator permission)
- `/resetxp user <target> <type>` - Reset XP for specific user
- `/resetxp server <type>` - Reset XP for entire server
- `/freezexp <user> <action> [duration] [reason]` - Freeze/unfreeze XP gain

## 🎨 Customization Options

### Level Card Themes
- **Default** - Classic Discord-style theme
- **Dark** - Sleek black theme
- **Blue** - Ocean-inspired blue theme
- **Green** - Nature-inspired green theme
- **Purple** - Royal purple theme
- **Red** - Bold red theme
- **Gold** - Luxury gold theme

### Reset Types
- **Current** - Reset current XP and level only
- **Monthly** - Reset monthly XP only (preserves total)
- **Total** - Reset everything (irreversible)

## 🌍 Multi-Language Support

The bot supports multiple languages with automatic detection based on user preferences:

- **English** (en) - Default
- **German** (de) - Deutsch

### Adding New Languages
1. Create a new locale file in `locales/` (e.g., `fr.json`)
2. Copy the structure from `en.json` and translate all strings
3. Add the language code to `supportedLanguages` in `src/utils/i18n.ts`
4. Restart the bot

## 🔧 Configuration

### XP System Settings
Each guild can customize their XP system:

- **XP Range** - Minimum and maximum XP per message
- **Cooldown** - Time between XP gains (prevents spam)
- **XP Rate** - Multiplier for all XP gains
- **Enable/Disable** - Toggle XP system per server

### Level Roles
Admins can set up automatic role rewards:
- Users automatically receive roles when reaching specific levels
- Multiple roles can be assigned per level
- Roles are granted immediately on level up

## 🗃️ Database Schema

The bot uses PostgreSQL with Prisma ORM:

- **Guilds** - Server settings and configuration
- **Users** - Per-guild user data (XP, level, customization)
- **LevelRoles** - Role rewards for specific levels
- **XPHistory** - Complete XP gain history
- **MonthlyResets** - Monthly reset tracking

## 🛡️ Security Features

- **Permission Checks** - Command-level permission validation
- **Admin Protection** - Prevents freezing admin users
- **Confirmation Dialogs** - Destructive actions require confirmation
- **Input Validation** - All user inputs are validated
- **Error Handling** - Comprehensive error catching and logging

## 🔄 Automatic Features

- **Monthly Resets** - Automatic 28-day leaderboard cycles
- **Role Assignment** - Automatic level role rewards
- **Freeze Expiry** - Automatic unfreezing after duration
- **Guild Setup** - Automatic database initialization for new servers

## 📊 Monitoring

The bot includes comprehensive logging:
- Command usage tracking
- Level up notifications
- Error logging with context
- Performance monitoring
- Guild statistics

## 🆘 Support

### Common Issues

**Bot not responding to commands:**
- Ensure bot has necessary permissions
- Check if commands are deployed (`npm run deploy`)
- Verify token and client ID are correct

**Database connection errors:**
- Verify DATABASE_URL is correct
- Ensure database is accessible
- Check if schema is pushed (`npm run db:push`)

**Level cards not generating:**
- Ensure Canvas dependencies are installed
- Check if user has valid avatar URL
- Verify custom background images are accessible

### Getting Help
1. Check the logs for error messages
2. Verify all environment variables are set
3. Ensure database schema is up to date
4. Check Discord bot permissions

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🎯 Roadmap

- [ ] Voice channel XP gain
- [ ] More level card themes
- [ ] Custom XP multipliers per channel/role
- [ ] Web dashboard for server management
- [ ] Integration with other bots
- [ ] Advanced statistics and analytics
- [ ] Custom level formulas
- [ ] XP import/export functionality
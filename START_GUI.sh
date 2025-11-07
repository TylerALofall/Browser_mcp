#!/bin/bash

# ECF 60 Validator - Local GUI Startup Script

clear

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║        ECF 60 Validator - Local GUI System                ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🔒 This system runs 100% LOCALLY on your computer"
echo "📁 Your files never leave this machine"
echo ""
echo "Starting local web server..."
echo ""

cd "$(dirname "$0")/gui"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ ERROR: Node.js is not installed"
    echo ""
    echo "Please install Node.js first:"
    echo "   Ubuntu/Debian: sudo apt install nodejs"
    echo "   Mac: brew install node"
    echo "   Or download from: https://nodejs.org/"
    echo ""
    exit 1
fi

# Start the server
node server.cjs

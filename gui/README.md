# ECF 60 Validator - Local GUI

## What This Does

This is a **local GUI application** that runs entirely on your computer to help you:

1. **Load ECF 60 data** - Import your court documents in JSON/JSONL format
2. **Identify negative claims** - Find all claims against you in ECF 60
3. **Find sources** - Locate where defendants originally made each claim
4. **Find your refutations** - Locate where you contradicted each claim with evidence
5. **Match to timeline** - Connect claims to your case timeline
6. **Build fraud proof** - Generate evidence of fraud upon the court

## 🔒 Privacy & Security

- **100% LOCAL** - Runs only on your computer
- **No cloud services** - Your files never leave your machine
- **No internet required** - Works completely offline (after initial setup)
- **Your data stays private** - No external servers or APIs

## Quick Start

### Step 1: Start the Server

Open a terminal in the `gui` folder and run:

```bash
cd /home/user/Browser_mcp/gui
node server.js
```

You should see:

```
╔════════════════════════════════════════════════════════════╗
║  ECF 60 Validator - Local GUI Server                      ║
╚════════════════════════════════════════════════════════════╝

✓ Server running at: http://localhost:3000

📁 Files are processed LOCALLY on your computer
🔒 No data is sent to external servers

Open your browser and navigate to:
   http://localhost:3000
```

### Step 2: Open in Browser

Open your web browser and go to:

```
http://localhost:3000
```

### Step 3: Load Your Data

1. Click **"Load ECF 60 Data"** or drag and drop your ECF file
2. Click **"Load Timeline"** to import your timeline (optional)
3. The system will analyze your data locally

## File Format

Your ECF files should be in JSON or JSONL format:

```json
[
  {
    "ecf": "60",
    "page": "1",
    "line": "5",
    "quoted_point": "The claim text here...",
    "matter_of": "Fact",
    "cited": "Source citation",
    "position": "Negative"
  }
]
```

**Position values:**
- `"Negative"` - Claims against you (what you need to refute)
- `"Positive"` - Your claims and evidence
- `"Neutral"` - Neutral facts

## Features

### Overview Tab
- See statistics at a glance
- Quick action buttons
- Data import controls

### Claims List Tab
- View all claims from ECF documents
- Filter by position (Negative/Positive/Neutral)
- Search claims by text
- Click any claim to validate it

### Timeline Tab
- View chronological case events
- See ECF cross-references
- Understand the case flow

### Validator Tab
- Select a claim to validate
- Find defendant sources (where they made the claim)
- Find your refutations (where you contradicted it)
- Match to timeline events
- See similarity scores

### Report Tab
- Generate fraud reports
- Export validation results
- Download evidence summaries

## How to Use

### Finding Negative Claims

1. Go to **Claims List** tab
2. Filter by **"Negative"** position
3. These are ALL claims against you in ECF 60
4. Click any claim to investigate

### Validating a Claim

1. Click a negative claim
2. System switches to **Validator** tab
3. Click **"Find Defendant Source"** - Finds where defendants made this claim
4. Click **"Find Tyler Refutations"** - Finds where you contradicted it
5. Click **"Match to Timeline"** - Connects to case timeline

### Building Your Case

For each negative claim, you'll see:
- **Defendant source** - ECF number, page, line where they made the claim
- **Your refutations** - Your evidence contradicting the claim
- **Match score** - How closely related (0-100%)
- **Timeline context** - When this happened in the case

This proves:
1. Defendants made false claims
2. You provided contradictory evidence
3. Court relied on false claims
4. Pattern of systematic fraud

## Sample Data

A sample `ECF_Master_List.json` is included in the root directory with example data:
- 5 negative claims from ECF 60
- 5 positive claims from Tyler
- 3 defendant claims from ECF 43, 44

Use this to test the system before loading your real data.

## Troubleshooting

### Server won't start
```bash
# Make sure you're in the gui directory
cd /home/user/Browser_mcp/gui

# Check if Node.js is installed
node --version

# If not installed, install Node.js first
```

### Page won't load
- Check that server is running (see terminal output)
- Make sure you're using `http://localhost:3000` (not https)
- Try a different browser

### Can't upload files
- Make sure files are `.json` or `.jsonl` format
- Check file contents are valid JSON
- Try the sample file first

## Next Steps

1. **Load your real ECF 60 data** - Replace sample with your actual documents
2. **Add your timeline** - Import case chronology
3. **Validate all negative claims** - Work through each one
4. **Export report** - Generate fraud proof document
5. **Use in court** - Include in your Rule 60(d)(3) motion

## Technical Details

- **Frontend**: Pure HTML/CSS/JavaScript (no frameworks needed)
- **Backend**: Simple Node.js HTTP server (no dependencies)
- **Data storage**: In-memory (no database required)
- **Processing**: All done in browser (client-side)

## Need Help?

- Check the **Overview** tab for statistics
- Use **Claims List** to browse all claims
- Use **Validator** for detailed analysis
- Export results and review offline

## Important Notes

- This tool does **fuzzy matching** to find similar claims
- Match scores above **70%** are usually strong matches
- Match scores below **30%** may be false positives
- **Always review matches manually** before using in court
- Save your work by exporting reports regularly

---

**Remember**: You have 2 weeks to complete the best document of your life. This tool helps you:
- Find every false claim
- Locate all your evidence
- Build systematic fraud proof
- Save time with automation

**Let's win this case!**

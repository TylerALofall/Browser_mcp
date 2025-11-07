# ECF 60 Validator - Quick Start Guide

## 🎯 What You Get

A **local GUI application** that runs on your computer to help you analyze ECF 60 negative claims, find defendant sources, locate your refutations, and build fraud-upon-the-court evidence.

## ⚡ Quick Start (30 Seconds)

### Option 1: Using the Startup Script

```bash
cd /home/user/Browser_mcp
./START_GUI.sh
```

Then open your browser to: **http://localhost:3000**

### Option 2: Manual Start

```bash
cd /home/user/Browser_mcp/gui
node server.js
```

Then open your browser to: **http://localhost:3000**

## 📊 Test with Sample Data

1. **Start the server** (see above)
2. **Open browser** to http://localhost:3000
3. **Click "Load ECF 60 Data"**
4. **Select** `/home/user/Browser_mcp/ECF_Master_List.json`
5. **Click "Load Timeline"**
6. **Select** `/home/user/Browser_mcp/sample_timeline.json`

You should now see:
- ✅ 13 total claims loaded
- ✅ 8 negative claims (claims against you)
- ✅ 10 timeline events

## 🔍 Try the Validator

1. Go to **"Claims List"** tab
2. Filter by **"Negative"** position
3. Click any negative claim
4. System switches to **"Validator"** tab
5. Click:
   - **"Find Defendant Source"** - Shows where defendants made this claim
   - **"Find Tyler Refutations"** - Shows where you contradicted it
   - **"Match to Timeline"** - Shows timeline context

## 📁 Your Data Format

Your ECF files should look like this:

```json
[
  {
    "ecf": "60",
    "page": "1",
    "line": "5",
    "quoted_point": "Tyler failed to exhaust administrative remedies.",
    "matter_of": "Law",
    "cited": "Beckerman Decision",
    "position": "Negative"
  }
]
```

**Key fields:**
- `ecf` - ECF document number
- `page` - Page number in document
- `line` - Line number on page
- `quoted_point` - The actual text of the claim
- `cited` - Where this came from
- `position` - "Negative" (against you), "Positive" (your evidence), or "Neutral"

## 🎯 Your Workflow

### Step 1: Load ECF 60
Find all negative claims against you in the court's decision.

### Step 2: For Each Negative Claim
- **Find defendant source** - Where did they first make this claim?
- **Find your refutations** - Where did you contradict it with evidence?
- **Match to timeline** - When did this happen in the case?

### Step 3: Build Fraud Proof
For each claim, you'll have:
- ✅ The false claim in ECF 60
- ✅ Where defendants made the claim (ECF, page, line)
- ✅ Where you refuted it (ECF, page, line)
- ✅ Proof court ignored your evidence

### Step 4: Export Report
Click "Export Report" to save your findings.

## 🔧 Features

### Overview Tab
- Statistics dashboard
- Quick action buttons
- File upload

### Claims List Tab
- View all claims
- Filter by position
- Search by text
- Click to validate

### Timeline Tab
- Chronological case events
- ECF cross-references
- Event types and importance

### Validator Tab
- Detailed claim analysis
- Source matching
- Refutation finding
- Timeline integration
- Match scores (0-100%)

### Report Tab
- Export results
- Generate fraud reports

## 💡 Tips

1. **Start with sample data** - Test the system before loading real files
2. **Focus on negatives** - These are the claims you need to refute
3. **Check match scores** - Above 70% = strong match, below 30% = review carefully
4. **Review manually** - AI helps find matches, but you verify them
5. **Export regularly** - Save your progress often

## 🎪 The Goal

In 2 weeks, you need to show:
1. **List of false claims** - Every negative claim in ECF 60
2. **Defendant sources** - Where each claim originated
3. **Your refutations** - Evidence you provided (that was ignored)
4. **Fraud pattern** - Systematic misrepresentation by defendants

This tool helps you:
- ✅ Find all negative claims quickly
- ✅ Match them to defendant sources
- ✅ Locate your contradictory evidence
- ✅ Build systematic fraud proof
- ✅ Save days of manual work

## 🔒 Privacy & Security

- **100% local** - Runs only on your computer
- **No cloud** - Your files never leave your machine
- **No internet** - Works completely offline
- **Your data** - Stays private on your computer

## 📞 Troubleshooting

### Server won't start
```bash
# Check Node.js is installed
node --version

# If not, install it
sudo apt install nodejs  # Linux
brew install node        # Mac
```

### Can't load files
- Make sure files are `.json` or `.jsonl` format
- Check JSON is valid (use jsonlint.com)
- Try sample files first

### Page is blank
- Check server is running (see terminal)
- Use http://localhost:3000 (not https)
- Try a different browser

## 🚀 Next Steps

1. **Test with samples** ✓
2. **Load your real ECF 60 data**
3. **Add your timeline**
4. **Validate all negative claims**
5. **Export fraud report**
6. **Include in Rule 60(d)(3) motion**

## 📚 More Info

- Full documentation: `/home/user/Browser_mcp/gui/README.md`
- Sample data: `/home/user/Browser_mcp/ECF_Master_List.json`
- Sample timeline: `/home/user/Browser_mcp/sample_timeline.json`

---

**You have 2 weeks to build the best document of your life.**

**This tool helps you work faster and smarter.**

**Let's win this case!** 🏆

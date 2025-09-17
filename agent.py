"""
AI Agent for GPS Navigation Decision Making
"""
import json
import os
import time
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import openai
from config import *

class GPSDecisionAgent:
    def __init__(self):
        """Initialize the AI Agent"""
        self.feedback_log = self.load_feedback_log()
        self.decision_rules = self.load_decision_rules()
        self.openai_client = None
        
        if OPENAI_API_KEY:
            openai.api_key = OPENAI_API_KEY
            self.openai_client = openai
            print("✅ OpenAI client initialized")
        else:
            print("⚠️ OpenAI API key not found. Set OPENAI_API_KEY in .env file")
    
    def load_feedback_log(self) -> List[Dict]:
        """Load feedback log from JSON file"""
        try:
            if os.path.exists(FEEDBACK_LOG_FILE):
                with open(FEEDBACK_LOG_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return []
        except Exception as e:
            print(f"❌ Error loading feedback log: {e}")
            return []
    
    def load_decision_rules(self) -> Dict:
        """Load decision rules from JSON file"""
        try:
            if os.path.exists(DECISION_RULES_FILE):
                with open(DECISION_RULES_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {"rules": {}, "metadata": {"created": datetime.now().isoformat(), "version": "1.0", "total_rules": 0}}
        except Exception as e:
            print(f"❌ Error loading decision rules: {e}")
            return {"rules": {}, "metadata": {"created": datetime.now().isoformat(), "version": "1.0", "total_rules": 0}}
    
    def save_feedback_log(self):
        """Save feedback log to JSON file"""
        try:
            with open(FEEDBACK_LOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.feedback_log, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"❌ Error saving feedback log: {e}")
    
    def save_decision_rules(self):
        """Save decision rules to JSON file"""
        try:
            with open(DECISION_RULES_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.decision_rules, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"❌ Error saving decision rules: {e}")
    
    def extract_anchors_from_log(self, log_message: str) -> List[int]:
        """Extract anchor IDs from log message"""
        try:
            # Look for patterns like [45, 38] or matched_ids: [45, 38]
            anchor_pattern = r'\[(\d+(?:,\s*\d+)*)\]'
            matches = re.findall(anchor_pattern, log_message)
            
            anchors = []
            for match in matches:
                if ',' in match:
                    anchors.extend([int(x.strip()) for x in match.split(',')])
                else:
                    anchors.append(int(match))
            
            return sorted(list(set(anchors)))  # Remove duplicates and sort
        except Exception as e:
            print(f"❌ Error extracting anchors: {e}")
            return []
    
    def extract_time_from_log(self, log_message: str) -> Optional[str]:
        """Extract time from log message"""
        try:
            # Look for time patterns like 07:13:21
            time_pattern = r'(\d{2}:\d{2}:\d{2})'
            match = re.search(time_pattern, log_message)
            return match.group(1) if match else None
        except Exception as e:
            print(f"❌ Error extracting time: {e}")
            return None
    
    def extract_crossing_from_log(self, log_message: str) -> Optional[str]:
        """Extract crossing name from log message"""
        try:
            # Look for crossing patterns like A/B/F
            crossing_pattern = r'([A-Z]+/[A-Z]+/[A-Z]+)'
            match = re.search(crossing_pattern, log_message)
            return match.group(1) if match else None
        except Exception as e:
            print(f"❌ Error extracting crossing: {e}")
            return None
    
    def should_ask_user(self, anchors: List[int], context: Dict) -> bool:
        """Determine if we should ask user for feedback"""
        anchor_key = str(sorted(anchors))
        
        # Check if we have a rule for these anchors
        if anchor_key in self.decision_rules.get("rules", {}):
            rule = self.decision_rules["rules"][anchor_key]
            confidence = rule.get("confidence", 0)
            
            # If confidence is high enough, don't ask
            if confidence >= CONFIDENCE_THRESHOLD:
                return False
        
        # Check if this is a new situation
        return True
    
    def get_ai_suggestion(self, anchors: List[int], context: Dict) -> str:
        """Get AI suggestion for decision"""
        if not self.openai_client:
            return "NEVÍM"
        
        try:
            # Prepare context for AI
            prompt = f"""
            Jste AI agent pro GPS navigaci. Analyzujte situaci na křižovatce:

            Kotvy: {anchors}
            Čas: {context.get('time', 'N/A')}
            Křižovatka: {context.get('crossing', 'N/A')}
            Pozice: {context.get('position', 'N/A')}

            Pravidla:
            - Kotvy [11, 12, 13] = segment A
            - Kotvy [37, 38, 45] = segment F (ale mohou být overlap)
            - Overlap kotvy = čekat na další

            Odpovězte pouze: ANO (jet do F), NE (čekat), nebo PROČ (vysvětlit)
            """
            
            response = self.openai_client.ChatCompletion.create(
                model=OPENAI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50,
                temperature=0.1
            )
            
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"❌ Error getting AI suggestion: {e}")
            return "NEVÍM"
    
    def ask_user_feedback(self, anchors: List[int], context: Dict) -> Tuple[str, str]:
        """Ask user for feedback"""
        print(f"\n🤖 AI Agent: [{context.get('time', 'N/A')}] Křižovatka {context.get('crossing', 'N/A')}")
        print(f"📍 Kotvy: {anchors}")
        print(f"❓ Rozhodnutí: Můžu jet do segmentu F?")
        print("   ANO - jedu do F")
        print("   NE - čekám na další kotvy")
        print("   PROČ - vysvětli mi situaci")
        
        # Get AI suggestion if available
        ai_suggestion = self.get_ai_suggestion(anchors, context)
        if ai_suggestion != "NEVÍM":
            print(f"💡 AI návrh: {ai_suggestion}")
        
        while True:
            response = input("Vaše rozhodnutí: ").strip().upper()
            if response in DECISION_TYPES:
                reason = ""
                if response == "PROČ":
                    reason = input("Vysvětlení: ").strip()
                return response, reason
            else:
                print("❌ Neplatná odpověď. Použijte: ANO, NE, nebo PROČ")
    
    def process_feedback(self, anchors: List[int], decision: str, reason: str, context: Dict):
        """Process user feedback and update rules"""
        anchor_key = str(sorted(anchors))
        
        # Add to feedback log
        feedback_entry = {
            "timestamp": datetime.now().isoformat(),
            "anchors": anchors,
            "crossing": context.get('crossing'),
            "user_decision": decision,
            "reason": reason,
            "context": context
        }
        
        self.feedback_log.append(feedback_entry)
        
        # Update decision rules
        if anchor_key not in self.decision_rules["rules"]:
            self.decision_rules["rules"][anchor_key] = {
                "decision": decision,
                "reason": reason,
                "confidence": 0.5,
                "usage_count": 0,
                "last_used": None
            }
        
        rule = self.decision_rules["rules"][anchor_key]
        
        # Update confidence based on consistency
        if rule["decision"] == decision:
            rule["confidence"] = min(1.0, rule["confidence"] + 0.1)
        else:
            rule["confidence"] = max(0.0, rule["confidence"] - 0.1)
        
        rule["usage_count"] += 1
        rule["last_used"] = datetime.now().isoformat()
        
        # Update metadata
        self.decision_rules["metadata"]["total_rules"] = len(self.decision_rules["rules"])
        self.decision_rules["metadata"]["last_updated"] = datetime.now().isoformat()
        
        # Save changes
        self.save_feedback_log()
        self.save_decision_rules()
        
        print(f"✅ Feedback uložen: {decision} pro kotvy {anchors}")
    
    def make_decision(self, log_message: str) -> Optional[str]:
        """Main decision making function"""
        try:
            # Extract information from log
            anchors = self.extract_anchors_from_log(log_message)
            time_str = self.extract_time_from_log(log_message)
            crossing = self.extract_crossing_from_log(log_message)
            
            if not anchors:
                return None
            
            context = {
                "time": time_str,
                "crossing": crossing,
                "position": "N/A",  # Could be extracted from log if needed
                "log_message": log_message
            }
            
            # Check if we should ask user
            if self.should_ask_user(anchors, context):
                decision, reason = self.ask_user_feedback(anchors, context)
                self.process_feedback(anchors, decision, reason, context)
                return decision
            else:
                # Use existing rule
                anchor_key = str(sorted(anchors))
                rule = self.decision_rules["rules"][anchor_key]
                print(f"🤖 Používám naučené pravidlo: {rule['decision']} (confidence: {rule['confidence']:.2f})")
                return rule["decision"]
                
        except Exception as e:
            print(f"❌ Error in make_decision: {e}")
            return None
    
    def start_monitoring(self):
        """Start monitoring debug logs"""
        print("🚀 AI Agent started monitoring debug logs...")
        print("📁 Monitoring file: ../adminlte/dist/debug-reporting.js")
        print("⏹️ Press Ctrl+C to stop")
        
        try:
            while True:
                # This is a simple implementation - in real scenario, you'd use file monitoring
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n⏹️ AI Agent stopped")

def main():
    """Main function"""
    print("🤖 GPS Decision AI Agent")
    print("=" * 50)
    
    agent = GPSDecisionAgent()
    
    # Test with sample log message
    test_log = "🔍 [CROSS-DEBUG] t=07:13:21, usable anchors: [45, 38]"
    print(f"\n🧪 Test log: {test_log}")
    
    decision = agent.make_decision(test_log)
    print(f"🎯 Decision: {decision}")
    
    # Start monitoring (commented out for testing)
    # agent.start_monitoring()

if __name__ == "__main__":
    main()

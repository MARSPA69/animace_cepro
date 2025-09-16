// DEBUG REPORTING SYSTEM
// Sběr debug logů a generování PDF reportů

(function() {
  'use strict';

  // Globální objekt pro debug reporting
  window.DebugReporting = {
    logs: [],
    sessionStartTime: null,
    sessionEndTime: null,
    isActive: false,
    originalConsoleLog: null,
    originalConsoleError: null,
    originalConsoleWarn: null,
    
    // Kategorizace logů podle emoji a prefixů
    LOG_CATEGORIES: {
      '🔴': 'CRITICAL',
      '🔍': 'ANCHOR_DEBUG', 
      '⏰': 'TIMING_DEBUG',
      '✅': 'DECISION_DEBUG',
      '🚨': 'FALLBACK_DEBUG',
      '⚙️': 'CONFIG_DEBUG',
      '🚶': 'WALKER_DEBUG',
      '💥': 'ERROR_DEBUG',
      '📊': 'SUMMARY_DEBUG',
      '🟢': 'STATUS_DEBUG',
      '⚠️': 'WARNING_DEBUG',
      '🔮': 'PREDICTION_DEBUG',
      '🚀': 'BUILD_START',
      '🔄': 'LOOP',
      '🎯': 'TARGET',
      '🚪': 'EXIT',
      '🚦': 'CROSS_MODE'
    },

    // Inicializace debug reporting systému
    init() {
      console.log('🔧 [DEBUG-REPORTING] Initializing debug reporting system...');
      this.setupEventListeners();
      this.createReportingDirectory();
    },

    // Nastavení event listenerů pro buttony
    setupEventListeners() {
      const debugReportBtn = document.getElementById('debug-report-btn');
      const chartsTablesBtn = document.getElementById('charts-tables-btn');

      if (debugReportBtn) {
        debugReportBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.generateDebugReport();
        });
      }

      if (chartsTablesBtn) {
        chartsTablesBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.showChartsAndTables();
        });
      }
    },

    // Spuštění sběru debug logů
    startLogging() {
      if (this.isActive) {
        console.warn('⚠️ [DEBUG-REPORTING] Logging already active');
        return;
      }

      this.sessionStartTime = new Date();
      this.isActive = true;
      this.logs = [];

      // Uložení originálních console funkcí
      this.originalConsoleLog = console.log;
      this.originalConsoleError = console.error;
      this.originalConsoleWarn = console.warn;

      // Přepsání console funkcí pro zachycení logů
      console.log = (...args) => {
        this.captureLog('LOG', args);
        this.originalConsoleLog.apply(console, args);
      };

      console.error = (...args) => {
        this.captureLog('ERROR', args);
        this.originalConsoleError.apply(console, args);
      };

      console.warn = (...args) => {
        this.captureLog('WARN', args);
        this.originalConsoleWarn.apply(console, args);
      };

      console.log('🚀 [DEBUG-REPORTING] Debug logging started at', this.sessionStartTime.toLocaleString());
    },

    // Zastavení sběru debug logů
    stopLogging() {
      if (!this.isActive) {
        console.warn('⚠️ [DEBUG-REPORTING] Logging not active');
        return;
      }

      this.sessionEndTime = new Date();
      this.isActive = false;

      // Obnovení originálních console funkcí
      console.log = this.originalConsoleLog;
      console.error = this.originalConsoleError;
      console.warn = this.originalConsoleWarn;

      console.log('⏹️ [DEBUG-REPORTING] Debug logging stopped at', this.sessionEndTime.toLocaleString());
      console.log('📊 [DEBUG-REPORTING] Total logs captured:', this.logs.length);
    },

    // Zachycení log zprávy
    captureLog(level, args) {
      const message = args.join(' ');
      const timestamp = new Date();
      
      const logEntry = {
        timestamp: timestamp,
        level: level,
        category: this.extractCategory(message),
        message: message,
        data: this.extractData(message),
        sessionTime: this.sessionStartTime ? (timestamp - this.sessionStartTime) / 1000 : 0
      };

      this.logs.push(logEntry);
    },

    // Extrakce kategorie z log zprávy
    extractCategory(message) {
      // Hledání emoji v zprávě
      for (const [emoji, category] of Object.entries(this.LOG_CATEGORIES)) {
        if (message.includes(emoji)) {
          return category;
        }
      }

      // Hledání prefixů v hranatých závorkách
      const bracketMatch = message.match(/\[([^\]]+)\]/);
      if (bracketMatch) {
        return bracketMatch[1].toUpperCase();
      }

      return 'GENERAL';
    },

    // Extrakce dat z log zprávy
    extractData(message) {
      const data = {};
      
      // Extrakce času
      const timeMatch = message.match(/(\d{2}:\d{2}:\d{2})/);
      if (timeMatch) {
        data.time = timeMatch[1];
      }

      // Extrakce souřadnic
      const coordMatch = message.match(/(\d+\.\d+),(\d+\.\d+)/);
      if (coordMatch) {
        data.lat = parseFloat(coordMatch[1]);
        data.lng = parseFloat(coordMatch[2]);
      }

      // Extrakce anchor IDs
      const anchorMatch = message.match(/\[([0-9,\s]+)\]/);
      if (anchorMatch) {
        data.anchors = anchorMatch[1].split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      }

      // Extrakce mesh ID
      const meshMatch = message.match(/MESH=(\d+)/);
      if (meshMatch) {
        data.meshId = parseInt(meshMatch[1]);
      }

      return data;
    },

    // Vytvoření reporting adresáře (webová verze)
    createReportingDirectory() {
      // V webovém prostředí nemůžeme vytvářet adresáře
      // PDF se stáhne do defaultního download adresáře uživatele
      console.log('📁 [DEBUG-REPORTING] PDF reports will be downloaded to user\'s default download directory');
    },

    // Generování debug reportu
    async generateDebugReport() {
      try {
        console.log('📊 [DEBUG-REPORTING] Generating debug report...');
        
        // Zastavení logování pokud je aktivní
        if (this.isActive) {
          this.stopLogging();
        }

        // Generování PDF
        const pdfBlob = await this.generatePDF();
        
        // Uložení PDF
        const fileName = this.generateFileName();
        await this.savePDF(pdfBlob, fileName);
        
        // Zobrazení úspěšné zprávy
        this.showSuccessMessage(fileName);
        
      } catch (error) {
        console.error('💥 [DEBUG-REPORTING] Failed to generate report:', error);
        this.showErrorMessage(error);
      }
    },

    // Generování PDF reportu
    async generatePDF() {
      // jsPDF je dostupný globálně
      const doc = new window.jspdf.jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text('DEBUG LOG REPORT', 20, 20);
      
      // Metadata
      doc.setFontSize(12);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35);
      doc.text(`Session: ${this.sessionStartTime ? this.sessionStartTime.toLocaleString() : 'N/A'} - ${this.sessionEndTime ? this.sessionEndTime.toLocaleString() : 'N/A'}`, 20, 45);
      doc.text(`Total Logs: ${this.logs.length}`, 20, 55);
      
      // Statistiky
      const stats = this.generateStatistics();
      doc.text(`Errors: ${stats.errors}`, 20, 65);
      doc.text(`Warnings: ${stats.warnings}`, 20, 75);
      doc.text(`Critical: ${stats.critical}`, 20, 85);
      
      // Kategorie logů
      const categories = this.groupLogsByCategory();
      let yPosition = 100;
      
      Object.keys(categories).forEach(category => {
        if (yPosition > 280) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setFontSize(14);
        doc.text(`${category} (${categories[category].length} logs)`, 20, yPosition);
        yPosition += 10;
        
        categories[category].slice(0, 20).forEach(log => { // Limit 20 logů na kategorii
          if (yPosition > 280) {
            doc.addPage();
            yPosition = 20;
          }
          
          doc.setFontSize(9);
          const logText = `${log.timestamp.toLocaleTimeString()}: ${log.message.substring(0, 80)}${log.message.length > 80 ? '...' : ''}`;
          doc.text(logText, 25, yPosition);
          yPosition += 5;
        });
        yPosition += 10;
      });
      
      return doc.output('blob');
    },

    // Seskupení logů podle kategorie
    groupLogsByCategory() {
      const categories = {};
      
      this.logs.forEach(log => {
        if (!categories[log.category]) {
          categories[log.category] = [];
        }
        categories[log.category].push(log);
      });
      
      // Seřazení podle počtu logů
      return Object.keys(categories)
        .sort((a, b) => categories[b].length - categories[a].length)
        .reduce((result, key) => {
          result[key] = categories[key];
          return result;
        }, {});
    },

    // Generování statistik
    generateStatistics() {
      const stats = {
        errors: 0,
        warnings: 0,
        critical: 0,
        total: this.logs.length
      };
      
      this.logs.forEach(log => {
        if (log.level === 'ERROR') stats.errors++;
        if (log.level === 'WARN') stats.warnings++;
        if (log.category === 'CRITICAL') stats.critical++;
      });
      
      return stats;
    },

    // Generování názvu souboru
    generateFileName() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      
      return `Log report_${year}_${day}_${month}.pdf`;
    },

    // Uložení PDF souboru
    async savePDF(pdfBlob, fileName) {
      try {
        // Pro webové prostředí - stažení souboru do defaultního download adresáře
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('💾 [DEBUG-REPORTING] PDF downloaded as:', fileName);
        console.log('📁 [DEBUG-REPORTING] File saved to user\'s default download directory');
      } catch (error) {
        console.error('💥 [DEBUG-REPORTING] Failed to save PDF:', error);
        throw error;
      }
    },

    // Zobrazení úspěšné zprávy
    showSuccessMessage(fileName) {
      // Použití AdminLTE toast notifikace
      if (window.toastr) {
        window.toastr.success(`Debug report generated successfully: ${fileName}`, 'Success');
      } else {
        alert(`Debug report generated successfully: ${fileName}`);
      }
    },

    // Zobrazení chybové zprávy
    showErrorMessage(error) {
      if (window.toastr) {
        window.toastr.error(`Failed to generate report: ${error.message}`, 'Error');
      } else {
        alert(`Failed to generate report: ${error.message}`);
      }
    },

    // Zobrazení Charts & Tables (placeholder)
    showChartsAndTables() {
      console.log('📊 [DEBUG-REPORTING] Charts & Tables feature coming soon...');
      if (window.toastr) {
        window.toastr.info('Charts & Tables feature coming soon...', 'Info');
      } else {
        alert('Charts & Tables feature coming soon...');
      }
    }
  };

  // Automatické spuštění při načtení stránky
  document.addEventListener('DOMContentLoaded', () => {
    window.DebugReporting.init();
    
    // Automatické spuštění logování
    window.DebugReporting.startLogging();
    
    console.log('🔧 [DEBUG-REPORTING] System initialized and logging started');
  });

})();

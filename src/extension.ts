import * as vscode from 'vscode';

enum Commands {
  startEarningsTicker = 'extension.startEarningsTicker',
  cancelEarningsTicker = 'extension.cancelEarningsTicker'
}
type UserInputs = [string, string, string];

class EarningsTicker {
  private annualSalary: number = 0;
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private statusBar: vscode.StatusBarItem | null = null;
  private workdayActive = false;
  private deactivationTimeoutSet = false;
  private approximateAnnualWorkDays = 261;

  constructor(private context: vscode.ExtensionContext) {}

  public activate() {
    this.loadState();

    this.context.subscriptions.push(
      vscode.commands.registerCommand(Commands.startEarningsTicker, () =>
        this.startEarningsTicker()
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(Commands.cancelEarningsTicker, () =>
        this.deactivate()
      )
    );
  }

  public deactivate() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    if (this.statusBar) {
      this.statusBar.hide();
      this.statusBar.dispose();
    }

    this.resetState();
  }

  private async startEarningsTicker() {
    const userInputs = await this.getUserInputs();

    if (!userInputs) {
      this.deactivate();
    } else if (!(await this.validateAndSetInputs(userInputs))) {
      this.deactivate();
    } else {
      this.updateStatusBar(this.annualSalary / this.approximateAnnualWorkDays);
    }
  }

  private loadState() {
    const storedSalary = this.context.globalState.get<number>(
      'annualSalary',
      0
    );

    const storedStartTime = this.context.globalState.get<string>(
      'startTime',
      new Date().toISOString()
    );

    const storedEndTime = this.context.globalState.get<string>(
      'endTime',
      new Date().toISOString()
    );

    this.annualSalary = storedSalary;
    this.startTime = new Date(storedStartTime);
    this.endTime = new Date(storedEndTime);
  }

  private async updateState(
    annualSalary: number,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    try {
      await Promise.all([
        this.context.globalState.update('annualSalary', annualSalary),
        this.context.globalState.update('startTime', startTime?.toISOString()),
        this.context.globalState.update('endTime', endTime?.toISOString())
      ]);
    } catch (error: unknown) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(
          'Failed to update state: ' + error.message
        );
      }
    }
  }

  private resetState() {
    this.annualSalary = 0;
    this.startTime = null;
    this.endTime = null;
    this.intervalId = null;
    this.statusBar = null;
    this.workdayActive = false;
    this.deactivationTimeoutSet = false;
  }

  private async getUserInputs(): Promise<UserInputs | null> {
    const salaryInput = await vscode.window.showInputBox({
      prompt: 'Enter your annual USD salary (NUMBERS ONLY):'
    });

    if (salaryInput === undefined) {
      this.deactivate();
      return null;
    }

    const startTimeInput = await vscode.window.showInputBox({
      prompt: 'Enter your shift start time (HH:MM AM/PM):'
    });

    if (startTimeInput === undefined) {
      this.deactivate();
      return null;
    }

    const endTimeInput = await vscode.window.showInputBox({
      prompt: 'Enter your shift end time (HH:MM AM/PM):'
    });

    if (endTimeInput === undefined) {
      this.deactivate();
      return null;
    }

    if (salaryInput && startTimeInput && endTimeInput) {
      return [salaryInput, startTimeInput, endTimeInput];
    } else {
      return null;
    }
  }

  private parseSalary(salaryInput: string): number | null {
    const parsedSalary = parseFloat(salaryInput);
    if (parsedSalary <= 0 || !Boolean(parsedSalary)) {
      vscode.window.showErrorMessage(
        'Invalid salary amount. Please enter a positive number.'
      );
      return null;
    }
    return parsedSalary;
  }

  private validateTimeFormat(time: string): boolean {
    const timeRegex = /^([0-9]|0[1-9]|1[0-2]):[0-5][0-9]\s?(?:AM|PM|am|pm)$/;
    return timeRegex.test(time);
  }

  private convertTo24Hour(time: string): [number, number] {
    const [hour, minute] = time.split(/[:\s]/, 2);
    let meridian = time.match(/AM|PM|am|pm/gi);
    let hour24 = parseInt(hour);

    // Convert PM hours to 24-hour format, except for 12 PM
    if (meridian && meridian[0].toUpperCase() === 'PM' && hour !== '12') {
      hour24 += 12;
    }

    // Convert 12 AM to 0
    if (hour === '12' && meridian && meridian[0].toUpperCase() === 'AM') {
      hour24 = 0;
    }

    return [hour24, parseInt(minute)];
  }

  private async validateAndSetInputs(userInputs: UserInputs): Promise<boolean> {
    const [salaryInput, startTimeInput, endTimeInput] = userInputs;

    const parsedSalary = this.parseSalary(salaryInput);

    if (!parsedSalary) {
      return false;
    }

    if (
      !this.validateTimeFormat(startTimeInput) ||
      !this.validateTimeFormat(endTimeInput)
    ) {
      vscode.window.showErrorMessage('Invalid time format. Use HH:MM AM/PM.');
      return false;
    }

    this.annualSalary = parsedSalary;

    const currentDate = new Date();
    this.startTime = new Date(currentDate);
    this.endTime = new Date(currentDate);

    const [startHour, startMinute] = this.convertTo24Hour(startTimeInput);
    const [endHour, endMinute] = this.convertTo24Hour(endTimeInput);

    this.startTime.setHours(startHour, startMinute, 0, 0);
    this.endTime.setHours(endHour, endMinute, 0, 0);

    // Ensure the start time is before the end time
    if (this.endTime <= this.startTime) {
      vscode.window.showErrorMessage('Start time must be before the end time.');
      return false;
    }

    try {
      await this.updateState(this.annualSalary, this.startTime, this.endTime);
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`An error occurred. ${error.message}`);
      } else {
        vscode.window.showErrorMessage('An unknown error occurred.');
      }
      return false;
    }
  }

  private updateStatusBar(dailySalary: number) {
    if (!this.statusBar) {
      this.statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
      this.statusBar.text = '';
      this.statusBar.color = '#39FF14';
      this.statusBar.show();
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      if (this.startTime && this.endTime && dailySalary && this.statusBar) {
        const now = new Date();

        if (now >= this.startTime && now <= this.endTime) {
          this.workdayActive = true;
          const elapsedMs = now.getTime() - this.startTime.getTime();
          const totalWorkMs = this.endTime.getTime() - this.startTime.getTime();
          const earned = (elapsedMs / totalWorkMs) * dailySalary;

          this.statusBar.text = `$${earned.toFixed(2)}`;
        } else if (this.workdayActive && !this.deactivationTimeoutSet) {
          this.deactivationTimeoutSet = true;
          this.workdayActive = false;

          this.statusBar.text = `Congrats! You Earned $${dailySalary.toFixed(
            2
          )}`;

          setTimeout(() => {
            this.deactivate();
          }, 10 * 60 * 1000); // 10 minutes in milliseconds

          if (this.intervalId) {
            clearInterval(this.intervalId);
          }
        } else {
          this.statusBar.text = `Congrats! You Earned $${dailySalary.toFixed(
            2
          )}`;
          setTimeout(() => {
            this.deactivate();
          }, 2 * 60 * 5000); // 2 minutes in milliseconds

          if (this.intervalId) {
            clearInterval(this.intervalId);
          }
        }
      }
    }, 1000);
  }
}

let ticker: EarningsTicker;

export function activate(context: vscode.ExtensionContext) {
  ticker = new EarningsTicker(context);
  ticker.activate();
}

export function deactivate() {
  ticker.deactivate();
}

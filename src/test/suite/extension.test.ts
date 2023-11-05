import * as assert from 'assert';
import * as vscode from 'vscode';
import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  before(() => {
    vscode.window.showInformationMessage('Starting all tests!');
  });

  after(() => {
    vscode.window.showInformationMessage('All tests done!');
  });

  test('Sample test', () => {});
});

import { describe, it, expect } from 'vitest';
import { FieldMatcher } from '../src/content/field-matcher';

describe('Dropdown & Option Matching', () => {
  const matcher = new FieldMatcher();

  it('maps Germany to Deutschland option', () => {
    const options = [
      { value: 'FR', text: 'France' },
      { value: 'DE', text: 'Deutschland' },
      { value: 'IT', text: 'Italy' }
    ];

    const selected = matcher.findBestSelectOption(options, 'Germany');
    expect(selected).toBe('DE');
  });

  it('maps Deutschland to Federal Republic of Germany', () => {
    const options = [
      { value: '1', text: 'Austria' },
      { value: '2', text: 'Federal Republic of Germany' },
      { value: '3', text: 'Switzerland' }
    ];

    const selected = matcher.findBestSelectOption(options, 'Deutschland');
    expect(selected).toBe('2');
  });

  it('maps boolean true to Yes / Ja options', () => {
    const options = [
      { value: '0', text: 'Nein' },
      { value: '1', text: 'Ja' }
    ];

    const selected = matcher.findBestSelectOption(options, 'true');
    expect(selected).toBe('1');
  });

  it('maps boolean false to No / Nein options', () => {
    const options = [
      { value: '0', text: 'No' },
      { value: '1', text: 'Yes' }
    ];

    const selected = matcher.findBestSelectOption(options, 'false');
    expect(selected).toBe('0');
  });

  it('maps +49 DE phone country calling code options', () => {
    const options = [
      { value: '+1', text: 'US +1' },
      { value: '+44', text: 'GB +44' },
      { value: '+49', text: '+49 DE' },
      { value: '+91', text: 'IN +91' }
    ];

    const selected = matcher.findBestSelectOption(options, '+49 DE');
    expect(selected).toBe('+49');
  });

  it('maps DE +49 reverse phone calling code options', () => {
    const options = [
      { value: 'US', text: 'US (+1)' },
      { value: 'DE', text: 'DE (+49)' },
      { value: 'FR', text: 'FR (+33)' }
    ];

    const selected = matcher.findBestSelectOption(options, '+49 DE');
    expect(selected).toBe('DE');
  });

  it('maps targetValue DE +49 to +49 option', () => {
    const options = [
      { value: '1', text: 'US (+1)' },
      { value: '49', text: 'Deutschland (+49)' },
      { value: '33', text: 'Frankreich (+33)' }
    ];

    const selected = matcher.findBestSelectOption(options, 'DE +49');
    expect(selected).toBe('49');
  });

  it('maps Mobil to Mobile / Mobil phone device options', () => {
    const options = [
      { value: '', text: 'Auswählen...' },
      { value: 'fax', text: 'Fax' },
      { value: 'mobil', text: 'Mobil' },
      { value: 'festnetz', text: 'Festnetz' }
    ];

    const selected = matcher.findBestSelectOption(options, 'Mobil');
    expect(selected).toBe('mobil');
  });

  it('maps Mobil to English Mobile option if portal uses English text', () => {
    const options = [
      { value: 'home', text: 'Home Phone' },
      { value: 'mobile', text: 'Mobile' },
      { value: 'work', text: 'Work' }
    ];

    const selected = matcher.findBestSelectOption(options, 'Mobil');
    expect(selected).toBe('mobile');
  });

  it('maps Deutschland to DE / Germany country options', () => {
    const options = [
      { value: 'AT', text: 'Österreich' },
      { value: 'DE', text: 'Deutschland' },
      { value: 'CH', text: 'Schweiz' }
    ];

    const selected = matcher.findBestSelectOption(options, 'Deutschland');
    expect(selected).toBe('DE');
  });

  it('maps Unmittelbar and Immediately to German Unmittelbar option', () => {
    const options = [
      { value: '', text: 'Auswählen...' },
      { value: 'unmittelbar', text: 'Unmittelbar' },
      { value: '1_monat', text: '1 Monat' },
      { value: '3_monate', text: '3 Monate' }
    ];

    expect(matcher.findBestSelectOption(options, 'Unmittelbar')).toBe('unmittelbar');
    expect(matcher.findBestSelectOption(options, 'Immediately')).toBe('unmittelbar');
    expect(matcher.findBestSelectOption(options, 'Sofort')).toBe('unmittelbar');
  });

  it('maps Unmittelbar to English Immediately option', () => {
    const options = [
      { value: '', text: 'Select One' },
      { value: 'immediate', text: 'Immediately' },
      { value: '1_month', text: '1 Month' }
    ];

    expect(matcher.findBestSelectOption(options, 'Unmittelbar')).toBe('immediate');
  });
});

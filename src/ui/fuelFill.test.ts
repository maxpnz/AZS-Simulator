import {describe,expect,it} from 'vitest';
import {fuelFillColor,reservoirPopoverColor} from './fuelFill';
describe('fuel fill colours',()=>{
 it('changes at each documented whole-percent boundary',()=>{
  expect([0,10,19,20,26,50,51,100].map(fuelFillColor)).toEqual(['#e65151','#e65151','#e65151','#e3cf41','#e3cf41','#e3cf41','#39d879','#39d879']);
 });
 it('interpolates the reservoir popover palette without changing other scales',()=>{
  expect([0,10,25,50,75,100].map(reservoirPopoverColor)).toEqual(['#e34c4c','#e34c4c','#ed963b','#e5ce42','#91cc43','#42c76b']);
  expect(reservoirPopoverColor(87.5)).toBe('#6aca57');
 });
});

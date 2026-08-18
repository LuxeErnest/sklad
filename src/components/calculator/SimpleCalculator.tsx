import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator, X, RotateCcw, Plus, Minus, X as MultiplyIcon, Divide, Equal, GripVertical } from 'lucide-react';

interface SimpleCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

const SimpleCalculator = ({ isOpen, onClose }: SimpleCalculatorProps) => {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  
  // Dragging state
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const calculatorRef = useRef<HTMLDivElement>(null);

  // Update position via CSS custom properties - optimized
  useEffect(() => {
    if (calculatorRef.current) {
      calculatorRef.current.style.setProperty('--calc-x', `${position.x}px`);
      calculatorRef.current.style.setProperty('--calc-y', `${position.y}px`);
    }
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      // Use requestAnimationFrame for smooth animation
      requestAnimationFrame(() => {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Keep calculator within viewport
        const maxX = window.innerWidth - 320;
        const maxY = window.innerHeight - 400;
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      });
    }
  }, [isDragging, dragOffset]);

  useEffect(() => {
    if (isDragging) {
      const handleMouseUp = () => setIsDragging(false);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-drag-handle]')) {
      e.preventDefault();
      setIsDragging(true);
      const rect = calculatorRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  }, []);

  const inputNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (display.indexOf('.') === -1) {
      setDisplay(display + '.');
    }
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operation) {
      const currentValue = previousValue || 0;
      const newValue = calculate(currentValue, inputValue, operation);

      setDisplay(String(newValue));
      setPreviousValue(newValue);
    }

    setWaitingForOperand(true);
    setOperation(nextOperation);
  };

  const calculate = (firstValue: number, secondValue: number, operation: string): number => {
    switch (operation) {
      case '+':
        return firstValue + secondValue;
      case '-':
        return firstValue - secondValue;
      case '×':
        return firstValue * secondValue;
      case '÷':
        return secondValue !== 0 ? firstValue / secondValue : 0;
      default:
        return secondValue;
    }
  };

  const handleEquals = () => {
    const inputValue = parseFloat(display);

    if (previousValue !== null && operation) {
      const newValue = calculate(previousValue, inputValue, operation);
      setDisplay(String(newValue));
      setPreviousValue(null);
      setOperation(null);
      setWaitingForOperand(true);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    const key = event.key;
    
    if (key >= '0' && key <= '9') {
      inputNumber(key);
    } else if (key === '.') {
      inputDecimal();
    } else if (key === '+') {
      performOperation('+');
    } else if (key === '-') {
      performOperation('-');
    } else if (key === '*') {
      performOperation('×');
    } else if (key === '/') {
      event.preventDefault();
      performOperation('÷');
    } else if (key === 'Enter' || key === '=') {
      handleEquals();
    } else if (key === 'Escape' || key === 'c' || key === 'C') {
      clear();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={calculatorRef}
      className={`draggable-calculator calculator-window ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <Card className="w-full bg-background/95 backdrop-blur-md border shadow-2xl">
        <CardHeader 
          className="pb-2 cursor-grab active:cursor-grabbing" 
          data-drag-handle
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <Calculator className="h-5 w-5" />
              Калькулятор
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Display */}
          <div className="bg-muted/50 rounded-lg p-4 text-right">
            <div className="text-3xl font-mono font-semibold min-h-[2rem] flex items-center justify-end">
              {display}
            </div>
            {operation && previousValue !== null && (
              <div className="text-sm text-muted-foreground mt-1">
                {previousValue} {operation}
              </div>
            )}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2" onKeyDown={handleKeyPress} tabIndex={0}>
            {/* Row 1 */}
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={clear}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => setDisplay(display.slice(0, -1) || '0')}
            >
              ⌫
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => performOperation('÷')}
            >
              <Divide className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => performOperation('×')}
            >
              <MultiplyIcon className="h-4 w-4" />
            </Button>

            {/* Row 2 */}
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('7')}
            >
              7
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('8')}
            >
              8
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('9')}
            >
              9
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => performOperation('-')}
            >
              <Minus className="h-4 w-4" />
            </Button>

            {/* Row 3 */}
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('4')}
            >
              4
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('5')}
            >
              5
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('6')}
            >
              6
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => performOperation('+')}
            >
              <Plus className="h-4 w-4" />
            </Button>

            {/* Row 4 */}
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('1')}
            >
              1
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('2')}
            >
              2
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => inputNumber('3')}
            >
              3
            </Button>
            <Button
              variant="default"
              className="h-12 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleEquals}
            >
              <Equal className="h-4 w-4" />
            </Button>

            {/* Row 5 */}
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold col-span-2"
              onClick={() => inputNumber('0')}
            >
              0
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={inputDecimal}
            >
              .
            </Button>
            <Button
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={handleEquals}
            >
              =
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-xs text-muted-foreground text-center">
            Используйте клавиатуру: цифры, +, -, *, /, Enter, Escape
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimpleCalculator;
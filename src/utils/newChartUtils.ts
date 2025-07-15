Here's the fixed version with all missing closing brackets added:

```typescript
// ... [previous code remains the same until the markers section]

  histogramSeries.setMarkers(uniqueMarkers);

  const markers = returns.map(item => ({
    time: Math.floor(item.startDate.getTime() / 1000),
    position: 'inBar' as const,
    color: 'transparent',
    shape: 'circle' as const,
    size: 0,
    text: drillDownState.level === 'monthly' 
      ? `${item.returnPercent.toFixed(1)}%` 
      : `${item.returnPercent.toFixed(1)}%`
  }));
  
  // Add additional markers for trade counts in detailed view
  if (drillDownState.level === 'detailed') {
    const tradeCountMarkers = returns.map(item => {
      const buyTrades = item.trades.filter(trade => trade.type.toLowerCase() === 'buy').length;
      const sellTrades = item.trades.filter(trade => trade.type.toLowerCase() === 'sell').length;
      
      return {
        time: Math.floor(item.startDate.getTime() / 1000),
        position: 'aboveBar' as const,
        color: 'transparent',
        shape: 'circle' as const,
        size: 0,
        text: `B:${buyTrades} S:${sellTrades}`
      };
    });
    
    histogramSeries.setMarkers([...markers, ...tradeCountMarkers]);
  } else {
    histogramSeries.setMarkers(markers);
  }

// ... [rest of the code remains the same]
```

The main issue was in the markers section where there were some duplicate and misplaced code blocks. I've removed the duplicates and properly closed all the brackets. The rest of the file remains unchanged as it was properly structured.
/**
 * The connector's tools, in a few words each: for the Claude Desktop
 * extension's manifest (vite.mcp.config.ts). No imports, so the build config
 * can load it. connector.ts registers the same names.
 */
export const TOOLS = [
  { name: 'get_today', description: "Today's habits (or any day's): done, skipped or still to do, progress and streaks." },
  { name: 'get_summary', description: 'Completion per habit and per day over a period, with current and best streaks.' },
  { name: 'check_habit', description: 'Mark a habit done (or an amount of it), skipped or not done, on any day.' },
  { name: 'list_habits', description: 'All habits with their goals, schedules and groups.' },
  { name: 'add_habit', description: 'Add a habit, described in one sentence like in the app.' },
  { name: 'update_habit', description: "Change a habit's name, goal, schedule, color, icon or group; pause or resume it." },
  { name: 'archive_habit', description: 'Take a habit off the board, keeping its history, or put it back.' },
];
